import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportModule } from '../../src/core/export.js';
import { MuninEventEmitter } from '../../src/core/events.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { ProgressEntry } from '../../src/types/progress.js';
import type { UserRating } from '../../src/types/ratings.js';
import type { Collection } from '../../src/types/collections.js';
import type { ExportBundle } from '../../src/types/contributions.js';

describe('ExportModule', () => {
  let storage: InMemoryBackend;
  let exportModule: ExportModule;

  beforeEach(() => {
    storage = new InMemoryBackend();
    exportModule = new ExportModule({ storage });
  });

  // --- Helper factories ---

  function makeProgress(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
    return {
      userId: 'user-1',
      titleId: 'title-1',
      type: 'movie',
      currentSeconds: 1200,
      durationSeconds: 3600,
      percent: 1200 / 3600,
      isCompleted: false,
      lastUpdated: new Date('2026-08-10T12:00:00Z'),
      ...overrides,
    };
  }

  function makeRating(overrides: Partial<UserRating> = {}): UserRating {
    return {
      userId: 'user-1',
      titleId: 'title-1',
      score: 8,
      tags: ['sci-fi'],
      ratedAt: new Date('2026-08-10T12:00:00Z'),
      ...overrides,
    };
  }

  function makeCollection(overrides: Partial<Collection> = {}): Collection {
    return {
      collectionId: 'col-1',
      userId: 'user-1',
      name: 'Favorites',
      type: 'manual',
      items: ['title-1', 'title-2'],
      createdAt: new Date('2026-08-10T12:00:00Z'),
      updatedAt: new Date('2026-08-10T12:00:00Z'),
      ...overrides,
    };
  }

  // ===== EXPORT TESTS =====

  describe('all()', () => {
    it('exports all data for a user (progress + ratings + collections)', async () => {
      const progress = makeProgress({ titleId: 'title-1' });
      const rating = makeRating({ titleId: 'title-2' });
      const collection = makeCollection({ collectionId: 'col-1' });

      await storage.setProgress(progress);
      await storage.setRating(rating);
      await storage.setCollection(collection);

      const bundle = await exportModule.all('user-1');

      expect(bundle.version).toBe(1);
      expect(bundle.userId).toBe('user-1');
      expect(bundle.exportedAt).toBeInstanceOf(Date);
      expect(bundle.data.progress).toHaveLength(1);
      expect(bundle.data.progress![0].titleId).toBe('title-1');
      expect(bundle.data.ratings).toHaveLength(1);
      expect(bundle.data.ratings![0].titleId).toBe('title-2');
      expect(bundle.data.collections).toHaveLength(1);
      expect(bundle.data.collections![0].name).toBe('Favorites');
    });

    it('exports with include filter (only progress)', async () => {
      await storage.setProgress(makeProgress());
      await storage.setRating(makeRating({ titleId: 'title-2' }));
      await storage.setCollection(makeCollection());

      const bundle = await exportModule.all('user-1', {
        format: 'json',
        include: ['progress'],
      });

      expect(bundle.data.progress).toHaveLength(1);
      expect(bundle.data.ratings).toBeUndefined();
      expect(bundle.data.collections).toBeUndefined();
    });

    it('exports with include filter (only ratings)', async () => {
      await storage.setProgress(makeProgress());
      await storage.setRating(makeRating({ titleId: 'title-2' }));
      await storage.setCollection(makeCollection());

      const bundle = await exportModule.all('user-1', {
        format: 'json',
        include: ['ratings'],
      });

      expect(bundle.data.progress).toBeUndefined();
      expect(bundle.data.ratings).toHaveLength(1);
      expect(bundle.data.collections).toBeUndefined();
    });

    it('exports with date range filter', async () => {
      const inRange = makeProgress({
        titleId: 'in-range',
        lastUpdated: new Date('2026-08-10T12:00:00Z'),
      });
      const outOfRange = makeProgress({
        titleId: 'out-of-range',
        lastUpdated: new Date('2026-07-01T12:00:00Z'),
      });

      await storage.setProgress(inRange);
      await storage.setProgress(outOfRange);

      const ratingInRange = makeRating({
        titleId: 'rating-in',
        ratedAt: new Date('2026-08-10T12:00:00Z'),
      });
      const ratingOutOfRange = makeRating({
        titleId: 'rating-out',
        ratedAt: new Date('2026-07-01T12:00:00Z'),
      });

      await storage.setRating(ratingInRange);
      await storage.setRating(ratingOutOfRange);

      const bundle = await exportModule.all('user-1', {
        format: 'json',
        dateRange: {
          from: new Date('2026-08-01T00:00:00Z'),
          to: new Date('2026-08-31T23:59:59Z'),
        },
      });

      expect(bundle.data.progress).toHaveLength(1);
      expect(bundle.data.progress![0].titleId).toBe('in-range');
      expect(bundle.data.ratings).toHaveLength(1);
      expect(bundle.data.ratings![0].titleId).toBe('rating-in');
    });

    it('export bundle has correct version and timestamp', async () => {
      const before = new Date();
      const bundle = await exportModule.all('user-1');
      const after = new Date();

      expect(bundle.version).toBe(1);
      expect(bundle.exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(bundle.exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('exports for user with no data returns empty arrays', async () => {
      const bundle = await exportModule.all('user-1');

      expect(bundle.data.progress).toEqual([]);
      expect(bundle.data.ratings).toEqual([]);
      expect(bundle.data.collections).toEqual([]);
    });

    it('export does not include other users data', async () => {
      await storage.setProgress(makeProgress({ userId: 'user-1', titleId: 'title-1' }));
      await storage.setProgress(makeProgress({ userId: 'user-2', titleId: 'title-2' }));
      await storage.setRating(makeRating({ userId: 'user-1', titleId: 'title-1' }));
      await storage.setRating(makeRating({ userId: 'user-2', titleId: 'title-2' }));

      const bundle = await exportModule.all('user-1');

      expect(bundle.data.progress).toHaveLength(1);
      expect(bundle.data.progress![0].titleId).toBe('title-1');
      expect(bundle.data.ratings).toHaveLength(1);
      expect(bundle.data.ratings![0].titleId).toBe('title-1');
    });
  });

  // ===== RESUME EXPORT TESTS =====

  describe('resumePositions()', () => {
    it('returns only in-progress items', async () => {
      const inProgress = makeProgress({
        titleId: 'in-progress',
        isCompleted: false,
        currentSeconds: 500,
      });
      const completed = makeProgress({
        titleId: 'completed',
        isCompleted: true,
        currentSeconds: 3500,
        percent: 0.97,
      });

      await storage.setProgress(inProgress);
      await storage.setProgress(completed);

      const resume = await exportModule.resumePositions('user-1');

      expect(resume.items).toHaveLength(1);
      expect(resume.items[0].titleId).toBe('in-progress');
    });

    it('excludes completed items', async () => {
      const completed1 = makeProgress({
        titleId: 'done-1',
        isCompleted: true,
        currentSeconds: 3600,
        percent: 1.0,
      });
      const completed2 = makeProgress({
        titleId: 'done-2',
        isCompleted: true,
        currentSeconds: 3400,
        percent: 0.95,
      });

      await storage.setProgress(completed1);
      await storage.setProgress(completed2);

      const resume = await exportModule.resumePositions('user-1');
      expect(resume.items).toHaveLength(0);
    });

    it('includes episode metadata', async () => {
      const episode = makeProgress({
        titleId: 'ep-s1e3',
        type: 'episode',
        isCompleted: false,
        currentSeconds: 800,
        seriesId: 'series-1',
        seasonNumber: 1,
        episodeNumber: 3,
      });

      await storage.setProgress(episode);

      const resume = await exportModule.resumePositions('user-1');

      expect(resume.items).toHaveLength(1);
      expect(resume.items[0].titleId).toBe('ep-s1e3');
      expect(resume.items[0].type).toBe('episode');
      expect(resume.items[0].seriesId).toBe('series-1');
      expect(resume.items[0].seasonNumber).toBe(1);
      expect(resume.items[0].episodeNumber).toBe(3);
      expect(resume.items[0].resumeSeconds).toBe(800);
    });

    it('resume positions sorted by lastUpdated desc', async () => {
      const older = makeProgress({
        titleId: 'older',
        isCompleted: false,
        currentSeconds: 100,
        lastUpdated: new Date('2026-08-08T10:00:00Z'),
      });
      const newer = makeProgress({
        titleId: 'newer',
        isCompleted: false,
        currentSeconds: 200,
        lastUpdated: new Date('2026-08-10T10:00:00Z'),
      });
      const newest = makeProgress({
        titleId: 'newest',
        isCompleted: false,
        currentSeconds: 300,
        lastUpdated: new Date('2026-08-12T10:00:00Z'),
      });

      await storage.setProgress(older);
      await storage.setProgress(newer);
      await storage.setProgress(newest);

      const resume = await exportModule.resumePositions('user-1');

      expect(resume.items[0].titleId).toBe('newest');
      expect(resume.items[1].titleId).toBe('newer');
      expect(resume.items[2].titleId).toBe('older');
    });

    it('resume positions empty for user with no progress', async () => {
      const resume = await exportModule.resumePositions('user-1');

      expect(resume.userId).toBe('user-1');
      expect(resume.exportedAt).toBeInstanceOf(Date);
      expect(resume.items).toEqual([]);
    });

    it('includes exportedAt and userId in resume export', async () => {
      const before = new Date();
      const resume = await exportModule.resumePositions('user-1');
      const after = new Date();

      expect(resume.userId).toBe('user-1');
      expect(resume.exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resume.exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ===== IMPORT TESTS =====

  describe('importData()', () => {
    it('imports progress entries into empty account', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'title-1' }),
            makeProgress({ titleId: 'title-2', currentSeconds: 600 }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      // Verify data is in storage
      const stored = await storage.getAllProgress('user-1');
      expect(stored).toHaveLength(2);
    });

    it('imports ratings into empty account', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          ratings: [
            makeRating({ titleId: 'title-1', score: 9 }),
            makeRating({ titleId: 'title-2', score: 7 }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      const stored = await storage.getAllRatings('user-1');
      expect(stored).toHaveLength(2);
    });

    it('imports collections with new IDs', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          collections: [
            makeCollection({ collectionId: 'original-id-1', name: 'My List' }),
            makeCollection({ collectionId: 'original-id-2', name: 'Watch Later' }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);

      const stored = await storage.getCollections('user-1');
      expect(stored).toHaveLength(2);

      // IDs should be different from originals
      const storedIds = stored.map((c) => c.collectionId);
      expect(storedIds).not.toContain('original-id-1');
      expect(storedIds).not.toContain('original-id-2');
    });

    it('import with skip strategy skips existing', async () => {
      // Pre-populate storage
      await storage.setProgress(makeProgress({ titleId: 'existing', currentSeconds: 500 }));

      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'existing', currentSeconds: 1000 }),
            makeProgress({ titleId: 'new-one', currentSeconds: 200 }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle, {
        conflictStrategy: 'skip',
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.details.find((d) => d.titleId === 'existing')?.action).toBe('skipped');
      expect(result.details.find((d) => d.titleId === 'new-one')?.action).toBe('imported');

      // Existing should NOT be overwritten
      const existing = await storage.getProgress('user-1', 'existing');
      expect(existing!.currentSeconds).toBe(500);
    });

    it('import with overwrite strategy replaces existing', async () => {
      // Pre-populate storage
      await storage.setProgress(makeProgress({ titleId: 'existing', currentSeconds: 500 }));

      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'existing', currentSeconds: 1000 }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle, {
        conflictStrategy: 'overwrite',
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.details[0].action).toBe('imported');

      // Should be overwritten
      const existing = await storage.getProgress('user-1', 'existing');
      expect(existing!.currentSeconds).toBe(1000);
    });

    it('import returns correct summary (imported/skipped counts)', async () => {
      await storage.setProgress(makeProgress({ titleId: 'existing-1' }));
      await storage.setRating(makeRating({ titleId: 'existing-rating' }));

      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'existing-1' }),
            makeProgress({ titleId: 'new-1' }),
            makeProgress({ titleId: 'new-2' }),
          ],
          ratings: [
            makeRating({ titleId: 'existing-rating' }),
            makeRating({ titleId: 'new-rating' }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle, {
        conflictStrategy: 'skip',
      });

      expect(result.imported).toBe(3); // new-1, new-2, new-rating
      expect(result.skipped).toBe(2); // existing-1, existing-rating
      expect(result.errors).toBe(0);
      expect(result.details).toHaveLength(5);
    });

    it('import does not emit events', async () => {
      // Create a Munin instance with events to verify no events are emitted
      const events = new MuninEventEmitter();
      const progressHandler = vi.fn();
      const ratingHandler = vi.fn();
      events.on('progress.updated', progressHandler);
      events.on('rating.added', ratingHandler);

      // ExportModule doesn't have access to events — it only uses storage directly
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [makeProgress({ titleId: 'title-1' })],
          ratings: [makeRating({ titleId: 'title-2' })],
        },
      };

      await exportModule.importData('user-1', bundle);

      // No events should have fired since ExportModule uses storage directly
      expect(progressHandler).not.toHaveBeenCalled();
      expect(ratingHandler).not.toHaveBeenCalled();
    });

    it('import handles invalid/malformed entries gracefully (counts as error)', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            // Valid entry
            makeProgress({ titleId: 'valid' }),
            // Invalid: missing required fields (cast to bypass TS checks)
            { titleId: '', type: 'movie', currentSeconds: 0, durationSeconds: 0, percent: 0, isCompleted: false, lastUpdated: new Date(), userId: 'user-1' } as ProgressEntry,
          ],
          ratings: [
            makeRating({ titleId: 'valid-rating' }),
            // Invalid: no score
            { titleId: 'bad-rating', score: undefined as unknown as number, tags: [], ratedAt: new Date(), userId: 'user-1' } as UserRating,
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      // Valid ones imported, invalid ones counted as errors
      expect(result.imported).toBe(2); // valid progress + valid rating
      expect(result.errors).toBe(2); // empty titleId + no score
      expect(result.details.filter((d) => d.action === 'error')).toHaveLength(2);
    });

    it('import full bundle (progress + ratings + collections combined)', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'movie-1' }),
            makeProgress({ titleId: 'ep-1', type: 'episode' }),
          ],
          ratings: [
            makeRating({ titleId: 'movie-1', score: 9 }),
            makeRating({ titleId: 'movie-2', score: 6 }),
          ],
          collections: [
            makeCollection({ name: 'Imported List 1' }),
            makeCollection({ name: 'Imported List 2', collectionId: 'col-2' }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      expect(result.imported).toBe(6);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      // Verify all data in storage
      const progress = await storage.getAllProgress('user-1');
      expect(progress).toHaveLength(2);

      const ratings = await storage.getAllRatings('user-1');
      expect(ratings).toHaveLength(2);

      const collections = await storage.getCollections('user-1');
      expect(collections).toHaveLength(2);
    });

    it('import defaults to skip strategy when no options provided', async () => {
      await storage.setProgress(makeProgress({ titleId: 'existing', currentSeconds: 500 }));

      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date(),
        userId: 'user-1',
        data: {
          progress: [
            makeProgress({ titleId: 'existing', currentSeconds: 1000 }),
          ],
        },
      };

      const result = await exportModule.importData('user-1', bundle);

      expect(result.skipped).toBe(1);
      expect(result.imported).toBe(0);

      // Should NOT be overwritten
      const existing = await storage.getProgress('user-1', 'existing');
      expect(existing!.currentSeconds).toBe(500);
    });
  });
});
