import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MmdbAdapter } from '../../src/adapters/mmdb.js';
import type { CreditEntry, PersonCreditEntry } from '../../src/adapters/mmdb.js';

// --- Test fixtures ---

const TEST_INDEX = {
  version: 1,
  built_at: '2026-08-19T06:00:00Z',
  stats: { total_movies: 3, total_series: 2, year_range: [2008, 2024] as [number, number] },
  movies: [
    {
      id: 'm_interstellar_2014',
      title: 'Interstellar',
      year: 2014,
      type: 'movie' as const,
      release_date: '2014-10-26',
      runtime_minutes: 169,
      external_ids: { imdb: 'tt0816692', tmdb: 157336, wikidata: 'Q13417189' },
    },
    {
      id: 'm_the_matrix_1999',
      title: 'The Matrix',
      year: 1999,
      type: 'movie' as const,
      release_date: '1999-03-31',
      runtime_minutes: 136,
      external_ids: { imdb: 'tt0133093', tmdb: 603 },
    },
    {
      id: 'm_inception_2010',
      title: 'Inception',
      year: 2010,
      type: 'movie' as const,
      release_date: '2010-07-16',
      runtime_minutes: 148,
      external_ids: { imdb: 'tt1375666', tmdb: 27205 },
    },
  ],
  series: [
    {
      id: 's_breaking_bad',
      title: 'Breaking Bad',
      start_year: 2008,
      end_year: 2013,
      total_seasons: 5,
      total_episodes: 62,
      external_ids: { imdb: 'tt0903747', tmdb: 1396, wikidata: 'Q1079' },
    },
    {
      id: 's_the_matrix_series',
      title: 'The Matrix Animated',
      start_year: 2020,
      end_year: undefined,
      total_seasons: 2,
      total_episodes: 16,
      external_ids: { imdb: 'tt9999999', tmdb: 99999 },
    },
  ],
};

const TEST_CREDITS_INDEX = {
  version: 1,
  built_at: '2026-08-19T07:00:00Z',
  stats: { total_credits: 8, total_people: 4, total_titles: 2 },
  credits_by_movie: {
    m_interstellar_2014: [
      { person_id: 'p_nolan', name: 'Christopher Nolan', role: 'director', department: 'directing', order: 0 },
      { person_id: 'p_mcconaughey', name: 'Matthew McConaughey', role: 'actor', character: 'Cooper', department: 'acting', order: 1 },
      { person_id: 'p_hathaway', name: 'Anne Hathaway', role: 'actor', character: 'Brand', department: 'acting', order: 2 },
    ] as CreditEntry[],
    m_inception_2010: [
      { person_id: 'p_nolan', name: 'Christopher Nolan', role: 'director', department: 'directing', order: 0 },
      { person_id: 'p_dicaprio', name: 'Leonardo DiCaprio', role: 'actor', character: 'Cobb', department: 'acting', order: 1 },
    ] as CreditEntry[],
  } as Record<string, CreditEntry[]>,
  credits_by_person: {
    p_nolan: [
      { title_id: 'm_interstellar_2014', title: 'Interstellar', role: 'director', department: 'directing', year: 2014 },
      { title_id: 'm_inception_2010', title: 'Inception', role: 'director', department: 'directing', year: 2010 },
    ] as PersonCreditEntry[],
    p_mcconaughey: [
      { title_id: 'm_interstellar_2014', title: 'Interstellar', role: 'actor', character: 'Cooper', department: 'acting', year: 2014 },
    ] as PersonCreditEntry[],
    p_hathaway: [
      { title_id: 'm_interstellar_2014', title: 'Interstellar', role: 'actor', character: 'Brand', department: 'acting', year: 2014 },
    ] as PersonCreditEntry[],
    p_dicaprio: [
      { title_id: 'm_inception_2010', title: 'Inception', role: 'actor', character: 'Cobb', department: 'acting', year: 2010 },
    ] as PersonCreditEntry[],
  } as Record<string, PersonCreditEntry[]>,
  people: {
    p_nolan: { id: 'p_nolan', name: 'Christopher Nolan' },
    p_mcconaughey: { id: 'p_mcconaughey', name: 'Matthew McConaughey' },
    p_hathaway: { id: 'p_hathaway', name: 'Anne Hathaway' },
    p_dicaprio: { id: 'p_dicaprio', name: 'Leonardo DiCaprio' },
  } as Record<string, { id: string; name: string }>,
};

function gzipEncode(data: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const raw = encoder.encode(data);
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(raw);
      controller.close();
    },
  });
  return readable.pipeThrough(new CompressionStream('gzip'));
}

function createMockFetch(
  titleIndex = TEST_INDEX,
  creditsIndex = TEST_CREDITS_INDEX,
  options?: { titleStatus?: number; creditsStatus?: number },
): typeof globalThis.fetch {
  const titleStatus = options?.titleStatus ?? 200;
  const creditsStatus = options?.creditsStatus ?? 200;

  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes('credits')) {
      if (creditsStatus !== 200) {
        return new Response(null, { status: creditsStatus, statusText: 'Not Found' });
      }
      const gzippedStream = gzipEncode(JSON.stringify(creditsIndex));
      return new Response(gzippedStream, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/gzip' },
      });
    }

    if (titleStatus !== 200) {
      return new Response(null, { status: titleStatus, statusText: 'Not Found' });
    }
    const gzippedStream = gzipEncode(JSON.stringify(titleIndex));
    return new Response(gzippedStream, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/gzip' },
    });
  }) as unknown as typeof globalThis.fetch;
}

// --- Tests ---

describe('MmdbAdapter', () => {
  let adapter: MmdbAdapter;
  let mockFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    mockFetch = createMockFetch();
    adapter = new MmdbAdapter({
      indexUrl: 'https://example.com/index.json.gz',
      creditsUrl: 'https://example.com/credits-index.json.gz',
      fetch: mockFetch,
    });
    await adapter.initialize();
  });

  describe('initialize()', () => {
    it('downloads and parses the gzipped index', async () => {
      expect(adapter.isReady).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/index.json.gz');
    });

    it('does NOT load credits during initialize', async () => {
      expect(adapter.isCreditsLoaded).toBe(false);
      // Only one fetch call (the title index)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on HTTP error', async () => {
      const failFetch = createMockFetch(TEST_INDEX, TEST_CREDITS_INDEX, { titleStatus: 404 });
      const failAdapter = new MmdbAdapter({
        indexUrl: 'https://example.com/missing.json.gz',
        fetch: failFetch,
      });

      await expect(failAdapter.initialize()).rejects.toThrow('Failed to fetch MMDB index: 404');
    });

    it('throws on network failure', async () => {
      const errorFetch = vi.fn(async () => {
        throw new Error('Network error');
      }) as unknown as typeof globalThis.fetch;

      const errorAdapter = new MmdbAdapter({
        indexUrl: 'https://example.com/index.json.gz',
        fetch: errorFetch,
      });

      await expect(errorAdapter.initialize()).rejects.toThrow('Network error');
    });
  });

  describe('isReady', () => {
    it('returns false before initialization', () => {
      const freshAdapter = new MmdbAdapter({ fetch: mockFetch });
      expect(freshAdapter.isReady).toBe(false);
    });

    it('returns true after initialization', () => {
      expect(adapter.isReady).toBe(true);
    });

    it('returns false after maxAge expires', async () => {
      const expiredAdapter = new MmdbAdapter({
        indexUrl: 'https://example.com/index.json.gz',
        fetch: mockFetch,
        maxAge: 0, // Immediately expire
      });
      await expiredAdapter.initialize();

      // Wait a tick for Date.now() to advance
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(expiredAdapter.isReady).toBe(false);
    });
  });

  describe('stats', () => {
    it('returns null before initialization', () => {
      const freshAdapter = new MmdbAdapter({ fetch: mockFetch });
      expect(freshAdapter.stats).toBeNull();
    });

    it('returns index stats after initialization', () => {
      expect(adapter.stats).toEqual({
        movies: 3,
        series: 2,
        yearRange: [2008, 2024],
      });
    });
  });

  describe('getTitle()', () => {
    it('returns movie metadata by ID', async () => {
      const title = await adapter.getTitle('m_interstellar_2014');

      expect(title).not.toBeNull();
      expect(title!.titleId).toBe('m_interstellar_2014');
      expect(title!.title).toBe('Interstellar');
      expect(title!.type).toBe('movie');
      expect(title!.year).toBe(2014);
      expect(title!.tags).toEqual([]);
    });

    it('returns series as title metadata', async () => {
      const title = await adapter.getTitle('s_breaking_bad');

      expect(title).not.toBeNull();
      expect(title!.titleId).toBe('s_breaking_bad');
      expect(title!.title).toBe('Breaking Bad');
      expect(title!.type).toBe('series');
      expect(title!.year).toBe(2008);
    });

    it('returns null for unknown ID', async () => {
      const title = await adapter.getTitle('nonexistent');
      expect(title).toBeNull();
    });
  });

  describe('getSeries()', () => {
    it('returns series metadata by ID', async () => {
      const series = await adapter.getSeries('s_breaking_bad');

      expect(series).not.toBeNull();
      expect(series!.seriesId).toBe('s_breaking_bad');
      expect(series!.title).toBe('Breaking Bad');
      expect(series!.totalSeasons).toBe(5);
      expect(series!.totalEpisodes).toBe(62);
      expect(series!.tags).toEqual([]);
    });

    it('returns null for movie IDs', async () => {
      const series = await adapter.getSeries('m_interstellar_2014');
      expect(series).toBeNull();
    });

    it('returns null for unknown ID', async () => {
      const series = await adapter.getSeries('nonexistent');
      expect(series).toBeNull();
    });
  });

  describe('search()', () => {
    it('finds titles by partial name', async () => {
      const results = await adapter.search('matrix');

      expect(results.length).toBeGreaterThanOrEqual(1);
      const titles = results.map((r) => r.title);
      expect(titles).toContain('The Matrix');
      expect(titles).toContain('The Matrix Animated');
    });

    it('exact match scores higher than prefix/contains', async () => {
      const results = await adapter.search('interstellar');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('Interstellar');
    });

    it('returns empty array for no match', async () => {
      const results = await adapter.search('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', async () => {
      const results = await adapter.search('');
      expect(results).toEqual([]);
    });

    it('respects limit option', async () => {
      const results = await adapter.search('matrix', { limit: 1 });
      expect(results).toHaveLength(1);
    });

    it('filters by type', async () => {
      const movieResults = await adapter.search('matrix', { type: 'movie' });
      const seriesResults = await adapter.search('matrix', { type: 'series' });

      expect(movieResults.every((r) => r.type === 'movie')).toBe(true);
      expect(seriesResults.every((r) => r.type === 'series')).toBe(true);
    });

    it('strips articles from query for matching', async () => {
      const results = await adapter.search('the matrix');

      // Should match — "the" is stripped, "matrix" matches
      expect(results.length).toBeGreaterThanOrEqual(1);
      const titles = results.map((r) => r.title);
      expect(titles).toContain('The Matrix');
    });
  });

  describe('getTagsForTitle()', () => {
    it('returns empty array (genres not yet in index)', async () => {
      const tags = await adapter.getTagsForTitle('m_interstellar_2014');
      expect(tags).toEqual([]);
    });

    it('returns empty array for unknown ID', async () => {
      const tags = await adapter.getTagsForTitle('nonexistent');
      expect(tags).toEqual([]);
    });
  });

  describe('getTmdbId()', () => {
    it('returns TMDB ID for a movie', async () => {
      const tmdbId = await adapter.getTmdbId('m_interstellar_2014');
      expect(tmdbId).toBe(157336);
    });

    it('returns TMDB ID for a series', async () => {
      const tmdbId = await adapter.getTmdbId('s_breaking_bad');
      expect(tmdbId).toBe(1396);
    });

    it('returns null for unknown ID', async () => {
      const tmdbId = await adapter.getTmdbId('nonexistent');
      expect(tmdbId).toBeNull();
    });
  });

  describe('getImdbId()', () => {
    it('returns IMDb ID for a movie', async () => {
      const imdbId = await adapter.getImdbId('m_interstellar_2014');
      expect(imdbId).toBe('tt0816692');
    });

    it('returns IMDb ID for a series', async () => {
      const imdbId = await adapter.getImdbId('s_breaking_bad');
      expect(imdbId).toBe('tt0903747');
    });

    it('returns null for unknown ID', async () => {
      const imdbId = await adapter.getImdbId('nonexistent');
      expect(imdbId).toBeNull();
    });
  });

  // --- Credits tests ---

  describe('getCreditsForTitle()', () => {
    it('lazy-loads credits index on first call', async () => {
      expect(adapter.isCreditsLoaded).toBe(false);

      const credits = await adapter.getCreditsForTitle('m_interstellar_2014');

      expect(adapter.isCreditsLoaded).toBe(true);
      expect(credits).toHaveLength(3);
      // Credits fetch happened (second call total after initialize)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/credits-index.json.gz');
    });

    it('returns cast and crew for a title', async () => {
      const credits = await adapter.getCreditsForTitle('m_interstellar_2014');

      expect(credits).toHaveLength(3);
      expect(credits[0]).toEqual({
        person_id: 'p_nolan',
        name: 'Christopher Nolan',
        role: 'director',
        department: 'directing',
        order: 0,
      });
      expect(credits[1]).toEqual({
        person_id: 'p_mcconaughey',
        name: 'Matthew McConaughey',
        role: 'actor',
        character: 'Cooper',
        department: 'acting',
        order: 1,
      });
    });

    it('returns empty array for titles without credits', async () => {
      const credits = await adapter.getCreditsForTitle('m_the_matrix_1999');
      expect(credits).toEqual([]);
    });

    it('returns empty array for unknown title', async () => {
      const credits = await adapter.getCreditsForTitle('nonexistent');
      expect(credits).toEqual([]);
    });

    it('does not re-fetch credits on subsequent calls', async () => {
      await adapter.getCreditsForTitle('m_interstellar_2014');
      await adapter.getCreditsForTitle('m_inception_2010');

      // Only 2 total fetches: 1 title + 1 credits
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFilmography()', () => {
    it('returns all titles a person worked on', async () => {
      const filmography = await adapter.getFilmography('p_nolan');

      expect(filmography).toHaveLength(2);
      expect(filmography[0]).toEqual({
        titleId: 'm_interstellar_2014',
        title: 'Interstellar',
        role: 'director',
        department: 'directing',
        year: 2014,
      });
      expect(filmography[1]).toEqual({
        titleId: 'm_inception_2010',
        title: 'Inception',
        role: 'director',
        department: 'directing',
        year: 2010,
      });
    });

    it('returns filmography with character names for actors', async () => {
      const filmography = await adapter.getFilmography('p_mcconaughey');

      expect(filmography).toHaveLength(1);
      expect(filmography[0].character).toBe('Cooper');
    });

    it('returns empty array for unknown person', async () => {
      const filmography = await adapter.getFilmography('p_unknown');
      expect(filmography).toEqual([]);
    });

    it('lazy-loads credits on first call', async () => {
      expect(adapter.isCreditsLoaded).toBe(false);
      await adapter.getFilmography('p_nolan');
      expect(adapter.isCreditsLoaded).toBe(true);
    });
  });

  describe('getPerson()', () => {
    it('returns person info by ID', async () => {
      const person = await adapter.getPerson('p_nolan');

      expect(person).not.toBeNull();
      expect(person!.id).toBe('p_nolan');
      expect(person!.name).toBe('Christopher Nolan');
    });

    it('returns null for unknown person ID', async () => {
      const person = await adapter.getPerson('p_unknown');
      expect(person).toBeNull();
    });

    it('lazy-loads credits on first call', async () => {
      expect(adapter.isCreditsLoaded).toBe(false);
      await adapter.getPerson('p_nolan');
      expect(adapter.isCreditsLoaded).toBe(true);
    });
  });

  describe('searchPeople()', () => {
    it('finds people by name', async () => {
      const results = await adapter.searchPeople('nolan');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p_nolan');
      expect(results[0].name).toBe('Christopher Nolan');
    });

    it('finds people by first name', async () => {
      const results = await adapter.searchPeople('matthew');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p_mcconaughey');
    });

    it('finds people by partial name (prefix)', async () => {
      const results = await adapter.searchPeople('leo');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p_dicaprio');
    });

    it('returns empty array for no match', async () => {
      const results = await adapter.searchPeople('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', async () => {
      const results = await adapter.searchPeople('');
      expect(results).toEqual([]);
    });

    it('respects limit option', async () => {
      const results = await adapter.searchPeople('a', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('lazy-loads credits on first call', async () => {
      expect(adapter.isCreditsLoaded).toBe(false);
      await adapter.searchPeople('nolan');
      expect(adapter.isCreditsLoaded).toBe(true);
    });
  });

  describe('credits lazy-loading behavior', () => {
    it('concurrent credits calls only trigger one fetch', async () => {
      // Call multiple credits methods simultaneously
      const [credits, filmography, person] = await Promise.all([
        adapter.getCreditsForTitle('m_interstellar_2014'),
        adapter.getFilmography('p_nolan'),
        adapter.getPerson('p_nolan'),
      ]);

      expect(credits).toHaveLength(3);
      expect(filmography).toHaveLength(2);
      expect(person).not.toBeNull();
      // Only 2 fetches total: 1 title index + 1 credits index
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on credits fetch failure', async () => {
      const failFetch = createMockFetch(TEST_INDEX, TEST_CREDITS_INDEX, { creditsStatus: 500 });
      const failAdapter = new MmdbAdapter({
        indexUrl: 'https://example.com/index.json.gz',
        creditsUrl: 'https://example.com/credits-index.json.gz',
        fetch: failFetch,
      });
      await failAdapter.initialize();

      await expect(failAdapter.getCreditsForTitle('m_interstellar_2014')).rejects.toThrow(
        'Failed to fetch MMDB credits index: 500',
      );
    });

    it('can retry after credits fetch failure', async () => {
      let callCount = 0;
      const retryFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;

        if (urlStr.includes('credits')) {
          callCount++;
          if (callCount === 1) {
            return new Response(null, { status: 500, statusText: 'Server Error' });
          }
          const gzippedStream = gzipEncode(JSON.stringify(TEST_CREDITS_INDEX));
          return new Response(gzippedStream, { status: 200, statusText: 'OK' });
        }

        const gzippedStream = gzipEncode(JSON.stringify(TEST_INDEX));
        return new Response(gzippedStream, { status: 200, statusText: 'OK' });
      }) as unknown as typeof globalThis.fetch;

      const retryAdapter = new MmdbAdapter({
        indexUrl: 'https://example.com/index.json.gz',
        creditsUrl: 'https://example.com/credits-index.json.gz',
        fetch: retryFetch,
      });
      await retryAdapter.initialize();

      // First call fails
      await expect(retryAdapter.getCreditsForTitle('m_interstellar_2014')).rejects.toThrow();

      // Second call succeeds (promise was cleared on failure)
      const credits = await retryAdapter.getCreditsForTitle('m_interstellar_2014');
      expect(credits).toHaveLength(3);
    });
  });

  describe('adapter interface compliance', () => {
    it('has name property', () => {
      expect(adapter.name).toBe('mmdb');
    });

    it('implements getTitle', () => {
      expect(typeof adapter.getTitle).toBe('function');
    });

    it('implements getSeries', () => {
      expect(typeof adapter.getSeries).toBe('function');
    });

    it('implements search', () => {
      expect(typeof adapter.search).toBe('function');
    });

    it('implements getTagsForTitle', () => {
      expect(typeof adapter.getTagsForTitle).toBe('function');
    });

    it('implements getCreditsForTitle', () => {
      expect(typeof adapter.getCreditsForTitle).toBe('function');
    });

    it('implements getFilmography', () => {
      expect(typeof adapter.getFilmography).toBe('function');
    });

    it('implements getPerson', () => {
      expect(typeof adapter.getPerson).toBe('function');
    });

    it('implements searchPeople', () => {
      expect(typeof adapter.searchPeople).toBe('function');
    });
  });
});
