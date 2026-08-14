import { describe, it, expect, beforeEach } from 'vitest';
import { ManualEntryAdapter } from '../../src/adapters/manual.js';
import type { ContributionEntry } from '../../src/types/contributions.js';

describe('ManualEntryAdapter', () => {
  let adapter: ManualEntryAdapter;

  beforeEach(() => {
    adapter = new ManualEntryAdapter();
  });

  function makeEntry(overrides: Partial<ContributionEntry> = {}): ContributionEntry {
    return {
      contributionId: 'contrib-1',
      userId: 'user-1',
      titleId: 'title-1',
      title: 'Test Movie',
      type: 'movie',
      tags: ['action', 'thriller'],
      year: 2024,
      language: 'en',
      region: 'US',
      submittedAt: new Date(),
      ...overrides,
    };
  }

  describe('submitContribution()', () => {
    it('stores entry and returns accepted result', async () => {
      const entry = makeEntry();
      const result = await adapter.submitContribution(entry);

      expect(result.status).toBe('accepted');
      expect(result.contributionId).toBe('contrib-1');
      expect(result.titleId).toBe('title-1');
    });
  });

  describe('getTitle()', () => {
    it('returns submitted entry', async () => {
      const entry = makeEntry({ titleId: 'movie-123' });
      await adapter.submitContribution(entry);

      const title = await adapter.getTitle('movie-123');

      expect(title).not.toBeNull();
      expect(title!.titleId).toBe('movie-123');
      expect(title!.title).toBe('Test Movie');
      expect(title!.type).toBe('movie');
      expect(title!.tags).toEqual(['action', 'thriller']);
      expect(title!.year).toBe(2024);
      expect(title!.language).toBe('en');
      expect(title!.region).toBe('US');
    });

    it('returns null for unknown titleId', async () => {
      const title = await adapter.getTitle('nonexistent');
      expect(title).toBeNull();
    });
  });

  describe('search()', () => {
    it('finds entries by partial title match', async () => {
      await adapter.submitContribution(makeEntry({ titleId: 't-1', title: 'The Matrix' }));
      await adapter.submitContribution(makeEntry({ titleId: 't-2', title: 'Matrix Reloaded' }));
      await adapter.submitContribution(makeEntry({ titleId: 't-3', title: 'Inception' }));

      const results = await adapter.search('matrix');

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.title)).toContain('The Matrix');
      expect(results.map((r) => r.title)).toContain('Matrix Reloaded');
    });

    it('returns empty array for no match', async () => {
      await adapter.submitContribution(makeEntry({ titleId: 't-1', title: 'The Matrix' }));

      const results = await adapter.search('avatar');

      expect(results).toEqual([]);
    });
  });

  describe('getTagsForTitle()', () => {
    it('returns tags from stored entry', async () => {
      await adapter.submitContribution(
        makeEntry({ titleId: 'tagged-1', tags: ['sci-fi', 'cyberpunk'] }),
      );

      const tags = await adapter.getTagsForTitle('tagged-1');
      expect(tags).toEqual(['sci-fi', 'cyberpunk']);
    });

    it('returns empty array for unknown titleId', async () => {
      const tags = await adapter.getTagsForTitle('nonexistent');
      expect(tags).toEqual([]);
    });
  });

  describe('getSeries()', () => {
    it('returns series entries', async () => {
      await adapter.submitContribution(
        makeEntry({
          titleId: 'series-1',
          title: 'Breaking Bad',
          type: 'series',
          tags: ['drama', 'crime'],
        }),
      );

      const series = await adapter.getSeries('series-1');

      expect(series).not.toBeNull();
      expect(series!.seriesId).toBe('series-1');
      expect(series!.title).toBe('Breaking Bad');
      expect(series!.tags).toEqual(['drama', 'crime']);
      expect(series!.totalSeasons).toBe(0);
      expect(series!.totalEpisodes).toBe(0);
    });

    it('returns null for movie entries', async () => {
      await adapter.submitContribution(makeEntry({ titleId: 'movie-1', type: 'movie' }));

      const series = await adapter.getSeries('movie-1');
      expect(series).toBeNull();
    });

    it('returns null for unknown seriesId', async () => {
      const series = await adapter.getSeries('nonexistent');
      expect(series).toBeNull();
    });
  });
});
