import { describe, it, expect, beforeEach } from 'vitest';
import { CollectionsModule } from '../../src/core/collections.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { Collection } from '../../src/types/collections.js';

describe('CollectionsModule', () => {
  let storage: InMemoryBackend;
  let collections: CollectionsModule;

  beforeEach(() => {
    storage = new InMemoryBackend();
    collections = new CollectionsModule({ storage });
  });

  describe('Manual Collections', () => {
    describe('create()', () => {
      it('creates a manual collection with initial items', async () => {
        const result = await collections.create('user-1', {
          name: 'Favorites',
          type: 'manual',
          items: ['title-1', 'title-2'],
        });

        expect(result.userId).toBe('user-1');
        expect(result.name).toBe('Favorites');
        expect(result.type).toBe('manual');
        expect(result.items).toEqual(['title-1', 'title-2']);
        expect(result.collectionId).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      });

      it('creates a manual collection without items (empty)', async () => {
        const result = await collections.create('user-1', {
          name: 'Watch Later',
          type: 'manual',
        });

        expect(result.name).toBe('Watch Later');
        expect(result.type).toBe('manual');
        expect(result.items).toEqual([]);
      });

      it('throws if name is empty', async () => {
        await expect(
          collections.create('user-1', { name: '', type: 'manual' }),
        ).rejects.toThrow('Collection name is required.');
      });
    });

    describe('get()', () => {
      it('returns stored collection with items', async () => {
        const created = await collections.create('user-1', {
          name: 'My List',
          type: 'manual',
          items: ['title-a', 'title-b'],
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        expect(result!.name).toBe('My List');
        expect(result!.items).toEqual(['title-a', 'title-b']);
      });

      it('returns null for non-existent collection', async () => {
        const result = await collections.get('user-1', 'non-existent-id');
        expect(result).toBeNull();
      });
    });

    describe('getAll()', () => {
      it('returns all user collections', async () => {
        await collections.create('user-1', { name: 'List 1', type: 'manual' });
        await collections.create('user-1', { name: 'List 2', type: 'manual' });
        await collections.create('user-1', { name: 'List 3', type: 'manual' });

        const result = await collections.getAll('user-1');
        expect(result).toHaveLength(3);
        expect(result.map((c) => c.name).sort()).toEqual(['List 1', 'List 2', 'List 3']);
      });

      it('returns empty array for user with no collections', async () => {
        const result = await collections.getAll('unknown-user');
        expect(result).toEqual([]);
      });
    });

    describe('addItem()', () => {
      it('adds item to manual collection', async () => {
        const created = await collections.create('user-1', {
          name: 'Queue',
          type: 'manual',
          items: ['title-1'],
        });

        const result = await collections.addItem('user-1', created.collectionId, 'title-2');
        expect(result.items).toEqual(['title-1', 'title-2']);
      });

      it('prevents duplicates (no error, just ignores)', async () => {
        const created = await collections.create('user-1', {
          name: 'Queue',
          type: 'manual',
          items: ['title-1'],
        });

        const result = await collections.addItem('user-1', created.collectionId, 'title-1');
        expect(result.items).toEqual(['title-1']);
      });

      it('throws on smart collection', async () => {
        const created = await collections.create('user-1', {
          name: 'Top Rated',
          type: 'smart',
          smartFilter: { minRating: 8 },
        });

        await expect(
          collections.addItem('user-1', created.collectionId, 'title-1'),
        ).rejects.toThrow('Cannot manually add items to a smart collection.');
      });

      it('updates updatedAt timestamp', async () => {
        const created = await collections.create('user-1', {
          name: 'Queue',
          type: 'manual',
        });

        const originalUpdatedAt = created.updatedAt.getTime();

        // Ensure different timestamps
        await new Promise((r) => setTimeout(r, 50));

        const result = await collections.addItem('user-1', created.collectionId, 'title-1');
        expect(result.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt);
      });
    });

    describe('removeItem()', () => {
      it('removes item from manual collection', async () => {
        const created = await collections.create('user-1', {
          name: 'Queue',
          type: 'manual',
          items: ['title-1', 'title-2', 'title-3'],
        });

        const result = await collections.removeItem('user-1', created.collectionId, 'title-2');
        expect(result.items).toEqual(['title-1', 'title-3']);
      });

      it('throws on smart collection', async () => {
        const created = await collections.create('user-1', {
          name: 'Smart List',
          type: 'smart',
          smartFilter: { minRating: 5 },
        });

        await expect(
          collections.removeItem('user-1', created.collectionId, 'title-1'),
        ).rejects.toThrow('Cannot manually remove items from a smart collection.');
      });

      it('updates updatedAt timestamp', async () => {
        const created = await collections.create('user-1', {
          name: 'Queue',
          type: 'manual',
          items: ['title-1'],
        });

        const originalUpdatedAt = created.updatedAt.getTime();

        await new Promise((r) => setTimeout(r, 50));

        const result = await collections.removeItem('user-1', created.collectionId, 'title-1');
        expect(result.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt);
      });
    });

    describe('update()', () => {
      it('renames collection', async () => {
        const created = await collections.create('user-1', {
          name: 'Old Name',
          type: 'manual',
        });

        const result = await collections.update('user-1', created.collectionId, {
          name: 'New Name',
        });
        expect(result.name).toBe('New Name');
      });

      it('throws if collection not found', async () => {
        await expect(
          collections.update('user-1', 'non-existent', { name: 'Updated' }),
        ).rejects.toThrow("Collection 'non-existent' not found.");
      });

      it('cannot change collection type via update', async () => {
        const created = await collections.create('user-1', {
          name: 'Manual List',
          type: 'manual',
        });

        const result = await collections.update('user-1', created.collectionId, {
          name: 'Still Manual',
        });

        // Type should remain 'manual' — type cannot be changed
        expect(result.type).toBe('manual');
      });
    });

    describe('delete()', () => {
      it('returns true when deleting existing collection', async () => {
        const created = await collections.create('user-1', {
          name: 'To Delete',
          type: 'manual',
        });

        const result = await collections.delete('user-1', created.collectionId);
        expect(result).toBe(true);

        // Verify it's gone
        const after = await collections.get('user-1', created.collectionId);
        expect(after).toBeNull();
      });

      it('returns false when deleting non-existent collection', async () => {
        const result = await collections.delete('user-1', 'non-existent-id');
        expect(result).toBe(false);
      });
    });
  });

  describe('Smart Collections', () => {
    // Helper to seed ratings and progress
    async function seedRatingsAndProgress() {
      // Seed ratings
      await storage.setRating({
        userId: 'user-1',
        titleId: 'movie-1',
        score: 9,
        tags: ['sci-fi', 'action'],
        ratedAt: new Date(),
      });
      await storage.setRating({
        userId: 'user-1',
        titleId: 'movie-2',
        score: 7,
        tags: ['drama', 'romance'],
        ratedAt: new Date(),
      });
      await storage.setRating({
        userId: 'user-1',
        titleId: 'movie-3',
        score: 4,
        tags: ['horror', 'action'],
        ratedAt: new Date(),
      });
      await storage.setRating({
        userId: 'user-1',
        titleId: 'series-1',
        score: 10,
        tags: ['sci-fi', 'thriller'],
        ratedAt: new Date(),
      });

      // Seed progress
      await storage.setProgress({
        userId: 'user-1',
        titleId: 'movie-1',
        type: 'movie',
        currentSeconds: 7200,
        durationSeconds: 7200,
        percent: 1.0,
        isCompleted: true,
        lastUpdated: new Date(),
      });
      await storage.setProgress({
        userId: 'user-1',
        titleId: 'movie-2',
        type: 'movie',
        currentSeconds: 3000,
        durationSeconds: 6000,
        percent: 0.5,
        isCompleted: false,
        lastUpdated: new Date(),
      });
      await storage.setProgress({
        userId: 'user-1',
        titleId: 'movie-3',
        type: 'movie',
        currentSeconds: 5400,
        durationSeconds: 5400,
        percent: 1.0,
        isCompleted: true,
        lastUpdated: new Date(),
      });
      await storage.setProgress({
        userId: 'user-1',
        titleId: 'series-1',
        type: 'series',
        currentSeconds: 1800,
        durationSeconds: 3600,
        percent: 0.5,
        isCompleted: false,
        lastUpdated: new Date(),
      });
    }

    describe('create()', () => {
      it('creates smart collection with minRating filter', async () => {
        const result = await collections.create('user-1', {
          name: 'Top Rated',
          type: 'smart',
          smartFilter: { minRating: 8 },
        });

        expect(result.type).toBe('smart');
        expect(result.smartFilter).toEqual({ minRating: 8 });
      });

      it('requires smartFilter for smart collections', async () => {
        await expect(
          collections.create('user-1', { name: 'Bad Smart', type: 'smart' }),
        ).rejects.toThrow('Smart collections require a smartFilter.');
      });
    });

    describe('get() — smart filter evaluation', () => {
      it('computes items from ratings (minRating)', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Highly Rated',
          type: 'smart',
          smartFilter: { minRating: 8 },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        // movie-1 (score 9) and series-1 (score 10) pass the minRating 8 filter
        expect(result!.items.sort()).toEqual(['movie-1', 'series-1']);
      });

      it('filters by tags (ANY match)', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Sci-Fi Collection',
          type: 'smart',
          smartFilter: { tags: ['sci-fi'] },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        // movie-1 (sci-fi, action) and series-1 (sci-fi, thriller) have 'sci-fi' tag
        expect(result!.items.sort()).toEqual(['movie-1', 'series-1']);
      });

      it('filters by isCompleted', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Completed',
          type: 'smart',
          smartFilter: { isCompleted: true },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        // movie-1 and movie-3 are completed
        expect(result!.items.sort()).toEqual(['movie-1', 'movie-3']);
      });

      it('combines multiple filters (AND logic)', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'High Rated + Completed',
          type: 'smart',
          smartFilter: { minRating: 8, isCompleted: true },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        // minRating >= 8: movie-1 (9), series-1 (10)
        // isCompleted: movie-1, movie-3
        // AND: only movie-1 passes both
        expect(result!.items).toEqual(['movie-1']);
      });

      it('filters by content type', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Series Only',
          type: 'smart',
          smartFilter: { type: 'series' },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        // Only series-1 has type 'series'
        expect(result!.items).toEqual(['series-1']);
      });

      it('returns empty array when no items match', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Impossible Filter',
          type: 'smart',
          smartFilter: { minRating: 11 },
        });

        const result = await collections.get('user-1', created.collectionId);
        expect(result).not.toBeNull();
        expect(result!.items).toEqual([]);
      });
    });

    describe('dynamic behavior', () => {
      it('smart collection updates when new ratings are added', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Top Rated',
          type: 'smart',
          smartFilter: { minRating: 8 },
        });

        // Initially: movie-1 (9) and series-1 (10)
        let result = await collections.get('user-1', created.collectionId);
        expect(result!.items.sort()).toEqual(['movie-1', 'series-1']);

        // Add a new high-rated title
        await storage.setRating({
          userId: 'user-1',
          titleId: 'new-movie',
          score: 8,
          tags: ['comedy'],
          ratedAt: new Date(),
        });

        // Smart collection should now include the new title
        result = await collections.get('user-1', created.collectionId);
        expect(result!.items.sort()).toEqual(['movie-1', 'new-movie', 'series-1']);
      });

      it('update smartFilter changes computed results', async () => {
        await seedRatingsAndProgress();

        const created = await collections.create('user-1', {
          name: 'Adjustable Filter',
          type: 'smart',
          smartFilter: { minRating: 8 },
        });

        // Initially: movie-1 (9) and series-1 (10)
        let result = await collections.get('user-1', created.collectionId);
        expect(result!.items.sort()).toEqual(['movie-1', 'series-1']);

        // Update filter to be less restrictive
        await collections.update('user-1', created.collectionId, {
          smartFilter: { minRating: 5 },
        });

        // Now: movie-1 (9), movie-2 (7), series-1 (10) pass (movie-3 score 4 fails)
        result = await collections.get('user-1', created.collectionId);
        expect(result!.items.sort()).toEqual(['movie-1', 'movie-2', 'series-1']);
      });
    });
  });
});
