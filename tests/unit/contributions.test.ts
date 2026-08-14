import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMunin } from '../../src/index.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import { ManualEntryAdapter } from '../../src/adapters/manual.js';
import type { MuninInstance } from '../../src/index.js';
import type { MediaDatabaseAdapter } from '../../src/adapters/types.js';
import type { ContributionEntry } from '../../src/types/contributions.js';

describe('ContributionsModule', () => {
  let storage: InMemoryBackend;
  let munin: MuninInstance;

  beforeEach(() => {
    storage = new InMemoryBackend();
    munin = createMunin({ storage });
  });

  describe('submit()', () => {
    it('submits contribution with all fields', async () => {
      const result = await munin.contributions.submit('user-1', {
        title: 'Indie Film',
        type: 'movie',
        year: 2024,
        language: 'en',
        tags: ['indie', 'drama'],
        region: 'US',
        studio: 'A24',
        description: 'A beautiful indie film',
      });

      expect(result.status).toBe('accepted');
      expect(result.contributionId).toBeDefined();
      expect(result.titleId).toBeDefined();
      expect(result.contributionId.length).toBeGreaterThan(0);
      expect(result.titleId.length).toBeGreaterThan(0);
    });

    it('submits contribution with required fields only', async () => {
      const result = await munin.contributions.submit('user-1', {
        title: 'Minimal Film',
        type: 'movie',
        tags: [],
      });

      expect(result.status).toBe('accepted');
      expect(result.contributionId).toBeDefined();
      expect(result.titleId).toBeDefined();
    });

    it('validates title is required (throws)', async () => {
      await expect(
        munin.contributions.submit('user-1', {
          title: '',
          type: 'movie',
          tags: [],
        }),
      ).rejects.toThrow('Contribution title is required.');
    });

    it('validates type is required (throws)', async () => {
      await expect(
        munin.contributions.submit('user-1', {
          title: 'A Film',
          type: '' as any,
          tags: [],
        }),
      ).rejects.toThrow('Contribution type is required.');
    });

    it('generates unique contributionId and titleId', async () => {
      const result1 = await munin.contributions.submit('user-1', {
        title: 'Film A',
        type: 'movie',
        tags: [],
      });
      const result2 = await munin.contributions.submit('user-1', {
        title: 'Film B',
        type: 'movie',
        tags: [],
      });

      expect(result1.contributionId).not.toBe(result2.contributionId);
      expect(result1.titleId).not.toBe(result2.titleId);
    });
  });

  describe('get()', () => {
    it('returns submitted contribution', async () => {
      const result = await munin.contributions.submit('user-1', {
        title: 'Test Film',
        type: 'movie',
        year: 2023,
        tags: ['test'],
      });

      const entry = await munin.contributions.get('user-1', result.contributionId);

      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Test Film');
      expect(entry!.type).toBe('movie');
      expect(entry!.year).toBe(2023);
      expect(entry!.tags).toEqual(['test']);
      expect(entry!.userId).toBe('user-1');
      expect(entry!.contributionId).toBe(result.contributionId);
      expect(entry!.titleId).toBe(result.titleId);
      expect(entry!.submittedAt).toBeInstanceOf(Date);
    });

    it('returns null for non-existent contribution', async () => {
      const entry = await munin.contributions.get('user-1', 'nonexistent-id');
      expect(entry).toBeNull();
    });
  });

  describe('getAll()', () => {
    it('returns all user contributions sorted by submittedAt desc', async () => {
      await munin.contributions.submit('user-1', {
        title: 'First Film',
        type: 'movie',
        tags: ['first'],
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await munin.contributions.submit('user-1', {
        title: 'Second Film',
        type: 'movie',
        tags: ['second'],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await munin.contributions.submit('user-1', {
        title: 'Third Film',
        type: 'series',
        tags: ['third'],
      });

      const all = await munin.contributions.getAll('user-1');

      expect(all).toHaveLength(3);
      // Most recent first
      expect(all[0].title).toBe('Third Film');
      expect(all[1].title).toBe('Second Film');
      expect(all[2].title).toBe('First Film');
    });
  });

  describe('events', () => {
    it('emits contribution.submitted event', async () => {
      const handler = vi.fn();
      munin.on('contribution.submitted', handler);

      await munin.contributions.submit('user-1', {
        title: 'Event Film',
        type: 'movie',
        tags: ['event'],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const emitted = handler.mock.calls[0][0] as ContributionEntry;
      expect(emitted.title).toBe('Event Film');
      expect(emitted.userId).toBe('user-1');
      expect(emitted.type).toBe('movie');
    });
  });

  describe('adapter forwarding', () => {
    it('forwards contribution to adapter that supports submitContribution', async () => {
      const adapter = new ManualEntryAdapter();
      const muninWithAdapter = createMunin({
        storage,
        adapters: [adapter],
      });

      const result = await muninWithAdapter.contributions.submit('user-1', {
        title: 'Adapter Film',
        type: 'movie',
        tags: ['adapter-test'],
      });

      expect(result.status).toBe('accepted');

      // Verify the adapter received and stored the entry
      const title = await adapter.getTitle(result.titleId);
      expect(title).not.toBeNull();
      expect(title!.title).toBe('Adapter Film');
    });

    it('succeeds locally when no adapter supports submitContribution', async () => {
      const adapterWithoutContrib: MediaDatabaseAdapter = {
        name: 'no-contrib',
        async getTitle() { return null; },
        async getSeries() { return null; },
        async search() { return []; },
        async getTagsForTitle() { return []; },
        // No submitContribution method
      };

      const muninNoContrib = createMunin({
        storage,
        adapters: [adapterWithoutContrib],
      });

      const result = await muninNoContrib.contributions.submit('user-1', {
        title: 'Local Only Film',
        type: 'movie',
        tags: ['local'],
      });

      expect(result.status).toBe('accepted');
      expect(result.contributionId).toBeDefined();
      expect(result.titleId).toBeDefined();

      // Still stored locally
      const entry = await muninNoContrib.contributions.get('user-1', result.contributionId);
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Local Only Film');
    });
  });

  describe('duplicate detection', () => {
    it('accepts duplicate (same title+type+year) but still stores', async () => {
      const result1 = await munin.contributions.submit('user-1', {
        title: 'Duplicate Film',
        type: 'movie',
        year: 2024,
        tags: ['dupe'],
      });

      const result2 = await munin.contributions.submit('user-1', {
        title: 'Duplicate Film',
        type: 'movie',
        year: 2024,
        tags: ['dupe'],
      });

      expect(result1.status).toBe('accepted');
      expect(result2.status).toBe('accepted');
      expect(result1.contributionId).not.toBe(result2.contributionId);

      const all = await munin.contributions.getAll('user-1');
      expect(all).toHaveLength(2);
    });
  });
});
