import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RatingsModule } from '../../src/core/ratings.js';
import { RecommendationsEngine } from '../../src/core/recommendations.js';
import { MuninEventEmitter } from '../../src/core/events.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { UserRating } from '../../src/types/ratings.js';

describe('RatingsModule', () => {
  let storage: InMemoryBackend;
  let events: MuninEventEmitter;
  let ratings: RatingsModule;
  let recommendations: RecommendationsEngine;

  beforeEach(() => {
    storage = new InMemoryBackend();
    events = new MuninEventEmitter();
    ratings = new RatingsModule({
      storage,
      events,
      maxScore: 10,
    });
    recommendations = new RecommendationsEngine({
      storage,
      ratings,
    });
    ratings.setRecommendationsEngine(recommendations);
  });

  describe('set()', () => {
    it('stores a rating correctly', async () => {
      const result = await ratings.set('user-1', 'title-1', {
        score: 8,
        tags: ['sci-fi', 'thriller'],
        notes: 'Great movie',
      });

      expect(result.userId).toBe('user-1');
      expect(result.titleId).toBe('title-1');
      expect(result.score).toBe(8);
      expect(result.tags).toEqual(['sci-fi', 'thriller']);
      expect(result.notes).toBe('Great movie');
      expect(result.ratedAt).toBeInstanceOf(Date);
    });

    it('updates an existing rating (overwrite score/tags)', async () => {
      await ratings.set('user-1', 'title-1', {
        score: 5,
        tags: ['drama'],
      });

      const updated = await ratings.set('user-1', 'title-1', {
        score: 9,
        tags: ['drama', 'romance'],
        notes: 'Rewatched and loved it',
      });

      expect(updated.score).toBe(9);
      expect(updated.tags).toEqual(['drama', 'romance']);
      expect(updated.notes).toBe('Rewatched and loved it');

      // Only one rating stored
      const all = await ratings.getAll('user-1');
      expect(all).toHaveLength(1);
    });

    it('emits rating.added event on set', async () => {
      const handler = vi.fn();
      events.on('rating.added', handler);

      const result = await ratings.set('user-1', 'title-1', {
        score: 7,
        tags: ['action'],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(result);
    });

    it('tags are stored correctly', async () => {
      const result = await ratings.set('user-1', 'title-1', {
        score: 6,
        tags: ['horror', 'mystery', 'psychological'],
      });

      expect(result.tags).toEqual(['horror', 'mystery', 'psychological']);

      const stored = await ratings.get('user-1', 'title-1');
      expect(stored?.tags).toEqual(['horror', 'mystery', 'psychological']);
    });

    it('notes are optional', async () => {
      const result = await ratings.set('user-1', 'title-1', {
        score: 7,
        tags: ['comedy'],
      });

      expect(result.notes).toBeUndefined();
    });
  });

  describe('score validation', () => {
    it('throws if score is below minimum (1)', async () => {
      await expect(
        ratings.set('user-1', 'title-1', { score: 0, tags: ['drama'] }),
      ).rejects.toThrow('Score 0 is out of range. Must be between 1 and 10.');
    });

    it('throws if score is above maximum (10)', async () => {
      await expect(
        ratings.set('user-1', 'title-1', { score: 11, tags: ['drama'] }),
      ).rejects.toThrow('Score 11 is out of range. Must be between 1 and 10.');
    });

    it('accepts minimum boundary value (1)', async () => {
      const result = await ratings.set('user-1', 'title-1', {
        score: 1,
        tags: ['boring'],
      });
      expect(result.score).toBe(1);
    });

    it('accepts maximum boundary value (10)', async () => {
      const result = await ratings.set('user-1', 'title-1', {
        score: 10,
        tags: ['masterpiece'],
      });
      expect(result.score).toBe(10);
    });

    it('throws for negative score', async () => {
      await expect(
        ratings.set('user-1', 'title-1', { score: -1, tags: [] }),
      ).rejects.toThrow('Score -1 is out of range');
    });

    it('respects custom max score', async () => {
      const customRatings = new RatingsModule({
        storage,
        events,
        maxScore: 5,
      });

      await expect(
        customRatings.set('user-1', 'title-1', { score: 6, tags: [] }),
      ).rejects.toThrow('Score 6 is out of range. Must be between 1 and 5.');

      const result = await customRatings.set('user-1', 'title-1', {
        score: 5,
        tags: [],
      });
      expect(result.score).toBe(5);
    });
  });

  describe('get()', () => {
    it('returns null for non-existent rating', async () => {
      const result = await ratings.get('user-1', 'non-existent');
      expect(result).toBeNull();
    });

    it('returns stored rating', async () => {
      await ratings.set('user-1', 'title-1', {
        score: 8,
        tags: ['sci-fi'],
        notes: 'Amazing',
      });

      const result = await ratings.get('user-1', 'title-1');
      expect(result).not.toBeNull();
      expect(result!.score).toBe(8);
      expect(result!.tags).toEqual(['sci-fi']);
      expect(result!.notes).toBe('Amazing');
    });
  });

  describe('getAll()', () => {
    it('returns all ratings sorted by ratedAt descending', async () => {
      // Set ratings with controlled timestamps
      await ratings.set('user-1', 'title-1', { score: 5, tags: ['a'] });

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await ratings.set('user-1', 'title-2', { score: 7, tags: ['b'] });

      await new Promise((r) => setTimeout(r, 10));
      await ratings.set('user-1', 'title-3', { score: 9, tags: ['c'] });

      const all = await ratings.getAll('user-1');
      expect(all).toHaveLength(3);

      // Most recent first
      expect(all[0].titleId).toBe('title-3');
      expect(all[1].titleId).toBe('title-2');
      expect(all[2].titleId).toBe('title-1');
    });

    it('returns empty array for user with no ratings', async () => {
      const all = await ratings.getAll('unknown-user');
      expect(all).toEqual([]);
    });
  });

  describe('delete()', () => {
    it('returns true when deleting existing rating', async () => {
      await ratings.set('user-1', 'title-1', { score: 7, tags: ['drama'] });

      const result = await ratings.delete('user-1', 'title-1');
      expect(result).toBe(true);
    });

    it('returns false when deleting non-existent rating', async () => {
      const result = await ratings.delete('user-1', 'non-existent');
      expect(result).toBe(false);
    });

    it('rating is no longer retrievable after deletion', async () => {
      await ratings.set('user-1', 'title-1', { score: 7, tags: ['drama'] });
      await ratings.delete('user-1', 'title-1');

      const result = await ratings.get('user-1', 'title-1');
      expect(result).toBeNull();
    });

    it('recalculates affinity after deletion', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-2', { score: 2, tags: ['sci-fi'] });

      const profileBefore = await recommendations.getAffinityProfile('user-1');
      const affinityBefore = profileBefore.affinities.get('sci-fi')!;

      // Delete the high-scoring one
      await ratings.delete('user-1', 'title-1');

      const profileAfter = await recommendations.getAffinityProfile('user-1');
      const affinityAfter = profileAfter.affinities.get('sci-fi')!;

      // Affinity should be lower after removing the 10-rated title
      expect(affinityAfter).toBeLessThan(affinityBefore);
    });
  });
});
