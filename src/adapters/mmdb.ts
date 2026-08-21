/**
 * MMDB Metadata Adapter — connects to the open-source media metadata database index.
 *
 * Downloads the combined index (gzipped JSON) from a configurable URL and provides
 * local search and lookup. The index is cached in memory with a configurable TTL.
 *
 * Credits index is lazy-loaded on first credits-related call to avoid unnecessary
 * bandwidth/memory for consumers that only need title search.
 *
 * Platform-agnostic: uses DecompressionStream (Node 18+ and modern browsers).
 */

import type { MediaDatabaseAdapter, TitleMetadata, SeriesMetadata } from './types.js';

// --- Index types (raw format from the combined index) ---

interface MmdbExternalIds {
  imdb?: string;
  tmdb?: number;
  wikidata?: string;
}

interface MmdbMovieEntry {
  id: string;
  title: string;
  year: number;
  type: 'movie';
  release_date?: string;
  runtime_minutes?: number;
  external_ids?: MmdbExternalIds;
}

interface MmdbSeriesEntry {
  id: string;
  title: string;
  start_year: number;
  end_year?: number;
  total_seasons: number;
  total_episodes: number;
  external_ids?: MmdbExternalIds;
}

interface MmdbIndexStats {
  total_movies: number;
  total_series: number;
  year_range: [number, number];
}

interface MmdbIndex {
  version: number;
  built_at: string;
  stats: MmdbIndexStats;
  movies: MmdbMovieEntry[];
  series: MmdbSeriesEntry[];
}

// --- Credits index types ---

/** Credit entry in the credits_by_movie map (person who worked on a title) */
export interface CreditEntry {
  person_id: string;
  name: string;
  role: string;
  character?: string;
  department?: string;
  order?: number;
}

/** Credit entry in the credits_by_person map (title a person worked on) */
export interface PersonCreditEntry {
  title_id: string;
  title: string;
  role: string;
  character?: string;
  department?: string;
  year?: number;
}

interface MmdbCreditsIndex {
  version: number;
  built_at: string;
  stats: { total_credits: number; total_people: number; total_titles: number };
  credits_by_movie: Record<string, CreditEntry[]>;
  credits_by_person: Record<string, PersonCreditEntry[]>;
  people: Record<string, { id: string; name: string }>;
}

export interface PersonInfo {
  id: string;
  name: string;
}

export interface FilmographyEntry {
  titleId: string;
  title: string;
  role: string;
  character?: string;
  department?: string;
  year?: number;
}

// --- Search index types ---

interface IndexedEntry {
  id: string;
  title: string;
  tokens: string[];
  type: 'movie' | 'series';
}

interface IndexedPerson {
  id: string;
  name: string;
  tokens: string[];
}

// --- Configuration ---

export interface MmdbAdapterConfig {
  /** URL to the gzipped combined index. Default: GitHub Release URL */
  indexUrl?: string;
  /** URL to the gzipped combined credits index. Default: GitHub Release URL */
  creditsUrl?: string;
  /** Cache TTL in ms (default: 24 hours) */
  maxAge?: number;
  /** Custom fetch function for testing or custom transport */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_INDEX_URL =
  'https://github.com/mimir-media-db/mmdb/releases/latest/download/combined-index.json.gz';
const DEFAULT_CREDITS_URL =
  'https://github.com/mimir-media-db/mmdb/releases/latest/download/combined-credits-index.json.gz';
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/** Articles to strip from titles during tokenization */
const ARTICLES = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'le', 'les', 'der', 'die', 'das']);

// --- Helpers ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !ARTICLES.has(t));
}

function tokenizeName(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function scoreMatch(queryTokens: string[], entryTokens: string[]): number {
  let score = 0;

  for (const qt of queryTokens) {
    let bestTokenScore = 0;

    for (const et of entryTokens) {
      if (et === qt) {
        // Exact match
        bestTokenScore = Math.max(bestTokenScore, 3);
      } else if (et.startsWith(qt)) {
        // Prefix match
        bestTokenScore = Math.max(bestTokenScore, 2);
      } else if (et.includes(qt)) {
        // Contains match
        bestTokenScore = Math.max(bestTokenScore, 1);
      }
    }

    score += bestTokenScore;
  }

  return score;
}

async function decompressGzip(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    throw new Error('Response body is null');
  }

  const ds = new DecompressionStream('gzip');
  const decompressedStream = body.pipeThrough(ds);
  const reader = decompressedStream.getReader();
  const decoder = new TextDecoder();

  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();

  return result;
}

// --- Adapter ---

export class MmdbAdapter implements MediaDatabaseAdapter {
  readonly name = 'mmdb';

  private readonly indexUrl: string;
  private readonly creditsUrl: string;
  private readonly maxAge: number;
  private readonly fetchFn: typeof globalThis.fetch;

  // Title index state
  private movieMap: Map<string, MmdbMovieEntry> = new Map();
  private seriesMap: Map<string, MmdbSeriesEntry> = new Map();
  private searchIndex: IndexedEntry[] = [];
  private indexStats: MmdbIndexStats | null = null;
  private loadedAt: number | null = null;

  // Credits index state (lazy-loaded)
  private creditsByMovie: Map<string, CreditEntry[]> = new Map();
  private creditsByPerson: Map<string, PersonCreditEntry[]> = new Map();
  private peopleMap: Map<string, PersonInfo> = new Map();
  private peopleSearchIndex: IndexedPerson[] = [];
  private creditsLoaded = false;
  private creditsLoadedAt: number | null = null;
  private creditsLoadPromise: Promise<void> | null = null;

  constructor(config?: MmdbAdapterConfig) {
    this.indexUrl = config?.indexUrl ?? DEFAULT_INDEX_URL;
    this.creditsUrl = config?.creditsUrl ?? DEFAULT_CREDITS_URL;
    this.maxAge = config?.maxAge ?? DEFAULT_MAX_AGE;
    this.fetchFn = config?.fetch ?? globalThis.fetch;
  }

  /** Download and parse the combined title index. Call once at startup. */
  async initialize(): Promise<void> {
    const response = await this.fetchFn(this.indexUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch MMDB index: ${response.status} ${response.statusText}`);
    }

    const json = await decompressGzip(response);
    const index: MmdbIndex = JSON.parse(json);

    // Build lookup maps
    this.movieMap.clear();
    this.seriesMap.clear();
    this.searchIndex = [];

    for (const movie of index.movies) {
      this.movieMap.set(movie.id, movie);
      this.searchIndex.push({
        id: movie.id,
        title: movie.title,
        tokens: tokenize(movie.title),
        type: 'movie',
      });
    }

    for (const series of index.series) {
      this.seriesMap.set(series.id, series);
      this.searchIndex.push({
        id: series.id,
        title: series.title,
        tokens: tokenize(series.title),
        type: 'series',
      });
    }

    this.indexStats = index.stats;
    this.loadedAt = Date.now();
  }

  /** Check if the title index is loaded and not expired */
  get isReady(): boolean {
    if (this.loadedAt === null) return false;
    return Date.now() - this.loadedAt < this.maxAge;
  }

  /** Check if the credits index has been loaded */
  get isCreditsLoaded(): boolean {
    return this.creditsLoaded;
  }

  /** Get index statistics */
  get stats(): { movies: number; series: number; yearRange: [number, number] } | null {
    if (!this.indexStats) return null;
    return {
      movies: this.indexStats.total_movies,
      series: this.indexStats.total_series,
      yearRange: this.indexStats.year_range,
    };
  }

  async getTitle(titleId: string): Promise<TitleMetadata | null> {
    const movie = this.movieMap.get(titleId);
    if (movie) {
      return this.movieToTitleMetadata(movie);
    }

    // Also check series — a series is also a "title"
    const series = this.seriesMap.get(titleId);
    if (series) {
      return this.seriesToTitleMetadata(series);
    }

    return null;
  }

  async getSeries(seriesId: string): Promise<SeriesMetadata | null> {
    const series = this.seriesMap.get(seriesId);
    if (!series) return null;

    return {
      seriesId: series.id,
      title: series.title,
      totalSeasons: series.total_seasons,
      totalEpisodes: series.total_episodes,
      tags: [], // Genres not yet available in combined index
      startYear: series.start_year,
      endYear: series.end_year,
      externalIds: series.external_ids,
    };
  }

  async search(query: string, options?: { limit?: number; type?: 'movie' | 'series' }): Promise<TitleMetadata[]> {
    const limit = options?.limit ?? 20;
    const typeFilter = options?.type;
    const queryTokens = tokenize(query);

    if (queryTokens.length === 0) return [];

    const scored: Array<{ entry: IndexedEntry; score: number }> = [];

    for (const entry of this.searchIndex) {
      if (typeFilter && entry.type !== typeFilter) continue;

      const score = scoreMatch(queryTokens, entry.tokens);
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    // Sort by score descending, then alphabetically for ties
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.title.localeCompare(b.entry.title);
    });

    const results: TitleMetadata[] = [];

    for (const { entry } of scored.slice(0, limit)) {
      if (entry.type === 'movie') {
        const movie = this.movieMap.get(entry.id)!;
        results.push(this.movieToTitleMetadata(movie));
      } else {
        const series = this.seriesMap.get(entry.id)!;
        results.push(this.seriesToTitleMetadata(series));
      }
    }

    return results;
  }

  async getTagsForTitle(_titleId: string): Promise<string[]> {
    // Genres/tags are not yet available in the combined index
    return [];
  }

  // --- Credits methods (lazy-loads credits index on first call) ---

  /** Get all credits for a given title (cast + crew). Lazy-loads credits index. */
  async getCreditsForTitle(titleId: string): Promise<CreditEntry[]> {
    await this.ensureCreditsLoaded();
    return this.creditsByMovie.get(titleId) ?? [];
  }

  /** Get filmography for a person. Lazy-loads credits index. */
  async getFilmography(personId: string): Promise<FilmographyEntry[]> {
    await this.ensureCreditsLoaded();
    const credits = this.creditsByPerson.get(personId);
    if (!credits) return [];

    return credits.map((c) => ({
      titleId: c.title_id,
      title: c.title,
      role: c.role,
      character: c.character,
      department: c.department,
      year: c.year,
    }));
  }

  /** Get person info by ID. Lazy-loads credits index. */
  async getPerson(personId: string): Promise<PersonInfo | null> {
    await this.ensureCreditsLoaded();
    return this.peopleMap.get(personId) ?? null;
  }

  /** Search people by name. Lazy-loads credits index. */
  async searchPeople(query: string, options?: { limit?: number }): Promise<PersonInfo[]> {
    await this.ensureCreditsLoaded();
    const limit = options?.limit ?? 20;
    const queryTokens = tokenizeName(query);

    if (queryTokens.length === 0) return [];

    const scored: Array<{ person: IndexedPerson; score: number }> = [];

    for (const person of this.peopleSearchIndex) {
      const score = scoreMatch(queryTokens, person.tokens);
      if (score > 0) {
        scored.push({ person, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.person.name.localeCompare(b.person.name);
    });

    return scored.slice(0, limit).map((s) => ({
      id: s.person.id,
      name: s.person.name,
    }));
  }

  // --- External ID helpers ---

  /** Get TMDB ID for poster lookups */
  async getTmdbId(titleId: string): Promise<number | null> {
    const movie = this.movieMap.get(titleId);
    if (movie?.external_ids?.tmdb) return movie.external_ids.tmdb;

    const series = this.seriesMap.get(titleId);
    if (series?.external_ids?.tmdb) return series.external_ids.tmdb;

    return null;
  }

  /** Get IMDb ID for external links */
  async getImdbId(titleId: string): Promise<string | null> {
    const movie = this.movieMap.get(titleId);
    if (movie?.external_ids?.imdb) return movie.external_ids.imdb;

    const series = this.seriesMap.get(titleId);
    if (series?.external_ids?.imdb) return series.external_ids.imdb;

    return null;
  }

  // --- Private helpers ---

  /**
   * Ensures credits index is loaded. Uses a singleton promise so multiple
   * concurrent calls don't trigger duplicate downloads.
   */
  private async ensureCreditsLoaded(): Promise<void> {
    if (this.creditsLoaded && this.creditsLoadedAt !== null) {
      if (Date.now() - this.creditsLoadedAt < this.maxAge) return;
      // Expired — reload
      this.creditsLoaded = false;
      this.creditsLoadPromise = null;
    }

    if (!this.creditsLoaded && !this.creditsLoadPromise) {
      this.creditsLoadPromise = this.loadCreditsIndex();
    }

    await this.creditsLoadPromise;
  }

  private async loadCreditsIndex(): Promise<void> {
    const response = await this.fetchFn(this.creditsUrl);

    if (!response.ok) {
      this.creditsLoadPromise = null;
      throw new Error(`Failed to fetch MMDB credits index: ${response.status} ${response.statusText}`);
    }

    const json = await decompressGzip(response);
    const index: MmdbCreditsIndex = JSON.parse(json);

    // Build credits lookup maps
    this.creditsByMovie.clear();
    this.creditsByPerson.clear();
    this.peopleMap.clear();
    this.peopleSearchIndex = [];

    for (const [movieId, credits] of Object.entries(index.credits_by_movie)) {
      this.creditsByMovie.set(movieId, credits);
    }

    for (const [personId, credits] of Object.entries(index.credits_by_person)) {
      this.creditsByPerson.set(personId, credits);
    }

    for (const [personId, person] of Object.entries(index.people)) {
      const info: PersonInfo = { id: personId, name: person.name };
      this.peopleMap.set(personId, info);
      this.peopleSearchIndex.push({
        id: personId,
        name: person.name,
        tokens: tokenizeName(person.name),
      });
    }

    this.creditsLoaded = true;
    this.creditsLoadedAt = Date.now();
  }

  private movieToTitleMetadata(movie: MmdbMovieEntry): TitleMetadata {
    return {
      titleId: movie.id,
      title: movie.title,
      type: 'movie',
      tags: [], // Genres not yet available
      year: movie.year,
      releaseDate: movie.release_date,
      runtimeMinutes: movie.runtime_minutes,
      externalIds: movie.external_ids,
    };
  }

  private seriesToTitleMetadata(series: MmdbSeriesEntry): TitleMetadata {
    return {
      titleId: series.id,
      title: series.title,
      type: 'series',
      tags: [], // Genres not yet available
      year: series.start_year,
      startYear: series.start_year,
      endYear: series.end_year,
      totalSeasons: series.total_seasons,
      totalEpisodes: series.total_episodes,
      externalIds: series.external_ids,
    };
  }
}
