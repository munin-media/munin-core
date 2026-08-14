import { describe, it, expect, beforeEach } from 'vitest';
import { createMunin } from '../../src/index.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { MuninInstance } from '../../src/index.js';

describe('GDPR deleteAllUserData', () => {
  let storage: InMemoryBackend;
  let munin: MuninInstance;

  beforeEach(() => {
    storage = new InMemoryBackend();
    munin = createMunin({ storage });
  });

  it('removes all progress entries for the user', async () => {
    await munin.progress.update('user-1', 'title-1', {
      currentSeconds: 500,
      durationSeconds: 3600,
      type: 'movie',
    });
    await munin.progress.update('user-1', 'title-2', {
      currentSeconds: 100,
      durationSeconds: 1800,
      type: 'movie',
    });

    await munin.deleteAllUserData('user-1');

    const progress = await storage.getAllProgress('user-1');
    expect(progress).toEqual([]);
  });

  it('removes all ratings for the user', async () => {
    await munin.ratings.set('user-1', 'title-1', { score: 8, tags: ['action'] });
    await munin.ratings.set('user-1', 'title-2', { score: 6, tags: ['drama'] });

    await munin.deleteAllUserData('user-1');

    const ratings = await storage.getAllRatings('user-1');
    expect(ratings).toEqual([]);
  });

  it('removes all collections for the user', async () => {
    await munin.collections.create('user-1', {
      name: 'Favorites',
      type: 'manual',
      items: ['title-1'],
    });
    await munin.collections.create('user-1', {
      name: 'Watchlist',
      type: 'manual',
      items: ['title-2'],
    });

    await munin.deleteAllUserData('user-1');

    const collections = await storage.getCollections('user-1');
    expect(collections).toEqual([]);
  });

  it('removes all contributions for the user', async () => {
    await munin.contributions.submit('user-1', {
      title: 'Indie Film',
      type: 'movie',
      tags: ['indie'],
    });
    await munin.contributions.submit('user-1', {
      title: 'Local Series',
      type: 'series',
      tags: ['local'],
    });

    await munin.deleteAllUserData('user-1');

    const contributions = await storage.getContributions('user-1');
    expect(contributions).toEqual([]);
  });

  it('removes affinity profile for the user', async () => {
    // Create an affinity profile via ratings (triggers recalculation)
    await munin.ratings.set('user-1', 'title-1', { score: 9, tags: ['sci-fi', 'thriller'] });

    // Verify profile exists
    const profileBefore = await storage.getAffinityProfile('user-1');
    expect(profileBefore).not.toBeNull();

    await munin.deleteAllUserData('user-1');

    const profileAfter = await storage.getAffinityProfile('user-1');
    expect(profileAfter).toBeNull();
  });

  it('returns correct counts of deleted items', async () => {
    await munin.progress.update('user-1', 'title-1', {
      currentSeconds: 500,
      durationSeconds: 3600,
      type: 'movie',
    });
    await munin.progress.update('user-1', 'title-2', {
      currentSeconds: 100,
      durationSeconds: 1800,
      type: 'movie',
    });
    await munin.ratings.set('user-1', 'title-1', { score: 8, tags: ['action'] });
    await munin.collections.create('user-1', {
      name: 'My List',
      type: 'manual',
      items: ['title-1'],
    });
    await munin.contributions.submit('user-1', {
      title: 'Local Film',
      type: 'movie',
      tags: ['indie'],
    });

    const result = await munin.deleteAllUserData('user-1');

    expect(result.deleted.progress).toBe(2);
    expect(result.deleted.ratings).toBe(1);
    expect(result.deleted.collections).toBe(1);
    expect(result.deleted.contributions).toBe(1);
    expect(result.deleted.affinityProfile).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('returns zero counts for user with no data', async () => {
    const result = await munin.deleteAllUserData('ghost-user');

    expect(result.deleted.progress).toBe(0);
    expect(result.deleted.ratings).toBe(0);
    expect(result.deleted.collections).toBe(0);
    expect(result.deleted.contributions).toBe(0);
    expect(result.deleted.affinityProfile).toBe(false);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('does not affect other users data', async () => {
    await munin.progress.update('user-1', 'title-1', {
      currentSeconds: 500,
      durationSeconds: 3600,
      type: 'movie',
    });
    await munin.progress.update('user-2', 'title-1', {
      currentSeconds: 200,
      durationSeconds: 3600,
      type: 'movie',
    });
    await munin.ratings.set('user-2', 'title-1', { score: 7, tags: ['comedy'] });

    await munin.deleteAllUserData('user-1');

    // user-2 data should be intact
    const user2Progress = await storage.getAllProgress('user-2');
    expect(user2Progress).toHaveLength(1);
    const user2Ratings = await storage.getAllRatings('user-2');
    expect(user2Ratings).toHaveLength(1);
  });

  it('after deletion, get operations return null/empty', async () => {
    await munin.progress.update('user-1', 'title-1', {
      currentSeconds: 500,
      durationSeconds: 3600,
      type: 'movie',
    });
    await munin.ratings.set('user-1', 'title-1', { score: 9, tags: ['thriller'] });

    await munin.deleteAllUserData('user-1');

    const progress = await storage.getProgress('user-1', 'title-1');
    expect(progress).toBeNull();

    const rating = await storage.getRating('user-1', 'title-1');
    expect(rating).toBeNull();

    const allProgress = await storage.getAllProgress('user-1');
    expect(allProgress).toEqual([]);

    const allRatings = await storage.getAllRatings('user-1');
    expect(allRatings).toEqual([]);
  });
});
