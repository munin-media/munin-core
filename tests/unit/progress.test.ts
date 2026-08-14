import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressTracker } from '../../src/core/progress.js';
import { MuninEventEmitter } from '../../src/core/events.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { ProgressEntry } from '../../src/types/progress.js';

describe('ProgressTracker', () => {
  let storage: InMemoryBackend;
  let events: MuninEventEmitter;
  let tracker: ProgressTracker;

  beforeEach(() => {
    storage = new InMemoryBackend();
    events = new MuninEventEmitter();
    tracker = new ProgressTracker({
      storage,
      events,
      completionThreshold: 0.9,
      conflictResolution: 'latest-wins',
    });
  });

  describe('update', () => {
    it('updates movie progress and calculates percent correctly', async () => {
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1800,
        durationSeconds: 3600,
        type: 'movie',
      });

      expect(result.userId).toBe('user-1');
      expect(result.titleId).toBe('movie-1');
      expect(result.type).toBe('movie');
      expect(result.currentSeconds).toBe(1800);
      expect(result.durationSeconds).toBe(3600);
      expect(result.percent).toBeCloseTo(0.5);
      expect(result.isCompleted).toBe(false);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('sets isCompleted = true when percent >= completionThreshold', async () => {
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 3300,
        durationSeconds: 3600,
        type: 'movie',
      });

      // 3300/3600 ≈ 0.917, which is >= 0.9
      expect(result.percent).toBeCloseTo(0.917, 2);
      expect(result.isCompleted).toBe(true);
    });

    it('does not set isCompleted when percent < threshold', async () => {
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 3200,
        durationSeconds: 3600,
        type: 'movie',
      });

      // 3200/3600 ≈ 0.889, which is < 0.9
      expect(result.percent).toBeCloseTo(0.889, 2);
      expect(result.isCompleted).toBe(false);
    });

    it('updates episode progress with series metadata', async () => {
      const result = await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 600,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(result.type).toBe('episode');
      expect(result.seriesId).toBe('series-1');
      expect(result.seasonId).toBe('season-1');
      expect(result.seasonNumber).toBe(1);
      expect(result.episodeNumber).toBe(1);
    });

    it('overwrites existing progress entry', async () => {
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
      });

      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1800,
        durationSeconds: 3600,
        type: 'movie',
      });

      expect(result.currentSeconds).toBe(1800);
      expect(result.percent).toBeCloseTo(0.5);

      // Verify only one entry in storage
      const stored = await tracker.get('user-1', 'movie-1');
      expect(stored?.currentSeconds).toBe(1800);
    });

    it('handles durationSeconds of 0 gracefully', async () => {
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 100,
        durationSeconds: 0,
        type: 'movie',
      });

      expect(result.percent).toBe(0);
      expect(result.isCompleted).toBe(false);
    });

    it('preserves deviceId in progress entry', async () => {
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'device-abc',
      });

      expect(result.deviceId).toBe('device-abc');
    });
  });

  describe('get', () => {
    it('returns null for non-existent progress', async () => {
      const result = await tracker.get('user-1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns stored progress entry', async () => {
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
      });

      const result = await tracker.get('user-1', 'movie-1');
      expect(result).not.toBeNull();
      expect(result!.currentSeconds).toBe(600);
    });
  });

  describe('getSeries', () => {
    it('returns null for non-existent series', async () => {
      const result = await tracker.getSeries('user-1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns correct series aggregation after episode updates', async () => {
      // Complete first episode
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Partially watch second episode
      await tracker.update('user-1', 'ep-s01e02', {
        currentSeconds: 600,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 2,
      });

      const series = await tracker.getSeries('user-1', 'series-1');
      expect(series).not.toBeNull();
      expect(series!.seriesId).toBe('series-1');
      expect(series!.totalEpisodes).toBe(2);
      expect(series!.completedEpisodes).toBe(1);
      expect(series!.overallPercent).toBeCloseTo(0.5);
      expect(series!.seasons).toHaveLength(1);
      expect(series!.seasons[0].seasonId).toBe('season-1');
      expect(series!.seasons[0].totalEpisodes).toBe(2);
      expect(series!.seasons[0].completedEpisodes).toBe(1);
      expect(series!.seasons[0].episodes).toHaveLength(2);
    });

    it('aggregates across multiple seasons', async () => {
      // Complete S01E01
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Complete S02E01
      await tracker.update('user-1', 'ep-s02e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-2',
        seasonNumber: 2,
        episodeNumber: 1,
      });

      const series = await tracker.getSeries('user-1', 'series-1');
      expect(series!.seasons).toHaveLength(2);
      expect(series!.seasons[0].seasonNumber).toBe(1);
      expect(series!.seasons[1].seasonNumber).toBe(2);
      expect(series!.totalEpisodes).toBe(2);
      expect(series!.completedEpisodes).toBe(2);
      expect(series!.overallPercent).toBeCloseTo(1.0);
    });
  });

  describe('getInProgress', () => {
    it('returns only non-completed entries sorted by lastUpdated desc', async () => {
      // Create completed entry
      await tracker.update('user-1', 'movie-done', {
        currentSeconds: 3500,
        durationSeconds: 3600,
        type: 'movie',
      });

      // Create in-progress entries with different timestamps
      await tracker.update('user-1', 'movie-old', {
        currentSeconds: 100,
        durationSeconds: 3600,
        type: 'movie',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await tracker.update('user-1', 'movie-new', {
        currentSeconds: 200,
        durationSeconds: 3600,
        type: 'movie',
      });

      const inProgress = await tracker.getInProgress('user-1');

      expect(inProgress).toHaveLength(2);
      expect(inProgress[0].titleId).toBe('movie-new');
      expect(inProgress[1].titleId).toBe('movie-old');
      // Completed entry should not appear
      expect(inProgress.find((e) => e.titleId === 'movie-done')).toBeUndefined();
    });

    it('supports pagination with limit and offset', async () => {
      // Create 5 in-progress entries
      for (let i = 1; i <= 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await tracker.update('user-1', `movie-${i}`, {
          currentSeconds: 100 * i,
          durationSeconds: 3600,
          type: 'movie',
        });
      }

      const page1 = await tracker.getInProgress('user-1', { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      expect(page1[0].titleId).toBe('movie-5');
      expect(page1[1].titleId).toBe('movie-4');

      const page2 = await tracker.getInProgress('user-1', { limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      expect(page2[0].titleId).toBe('movie-3');
      expect(page2[1].titleId).toBe('movie-2');

      const page3 = await tracker.getInProgress('user-1', { limit: 2, offset: 4 });
      expect(page3).toHaveLength(1);
      expect(page3[0].titleId).toBe('movie-1');
    });

    it('returns empty array when no progress exists', async () => {
      const inProgress = await tracker.getInProgress('user-1');
      expect(inProgress).toEqual([]);
    });
  });

  describe('season completion', () => {
    it('completes a season when all episodes are done', async () => {
      const seasonHandler = vi.fn();
      events.on('season.completed', seasonHandler);

      // Complete episode 1
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Complete episode 2 (last in season)
      await tracker.update('user-1', 'ep-s01e02', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 2,
      });

      expect(seasonHandler).toHaveBeenCalledTimes(1);
      expect(seasonHandler).toHaveBeenCalledWith({
        userId: 'user-1',
        seriesId: 'series-1',
        seasonNumber: 1,
      });
    });

    it('does not emit season.completed when season is partially done', async () => {
      const seasonHandler = vi.fn();
      events.on('season.completed', seasonHandler);

      // Start watching episode 1 (partial)
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 300,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Start watching episode 2 (partial)
      await tracker.update('user-1', 'ep-s01e02', {
        currentSeconds: 300,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 2,
      });

      // Complete only episode 1
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Season has 2 episodes, only 1 complete — should not fire
      expect(seasonHandler).not.toHaveBeenCalled();
    });
  });

  describe('series completion', () => {
    it('completes a series when all seasons are done', async () => {
      const seriesHandler = vi.fn();
      events.on('series.completed', seriesHandler);

      // Complete S01E01
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Complete S02E01 (last episode in series)
      await tracker.update('user-1', 'ep-s02e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-2',
        seasonNumber: 2,
        episodeNumber: 1,
      });

      expect(seriesHandler).toHaveBeenCalledTimes(1);
      expect(seriesHandler).toHaveBeenCalledWith({
        userId: 'user-1',
        seriesId: 'series-1',
      });
    });

    it('does not emit series.completed when some episodes remain', async () => {
      const seriesHandler = vi.fn();
      events.on('series.completed', seriesHandler);

      // Start watching S01E01 (partial)
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 300,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Start watching S02E01 (partial)
      await tracker.update('user-1', 'ep-s02e01', {
        currentSeconds: 300,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-2',
        seasonNumber: 2,
        episodeNumber: 1,
      });

      // Complete only S01E01
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Series has 2 episodes across 2 seasons, only 1 is complete
      expect(seriesHandler).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('emits progress.updated on every update', async () => {
      const handler = vi.fn();
      events.on('progress.updated', handler);

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          titleId: 'movie-1',
          currentSeconds: 600,
        }),
      );
    });

    it('emits episode.completed when episode crosses threshold', async () => {
      const handler = vi.fn();
      events.on('episode.completed', handler);

      // Below threshold - no event
      await tracker.update('user-1', 'ep-1', {
        currentSeconds: 500,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(handler).not.toHaveBeenCalled();

      // Above threshold - event emitted
      await tracker.update('user-1', 'ep-1', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          titleId: 'ep-1',
          isCompleted: true,
        }),
      );
    });

    it('does not emit episode.completed for movies', async () => {
      const handler = vi.fn();
      events.on('episode.completed', handler);

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 3500,
        durationSeconds: 3600,
        type: 'movie',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not re-emit episode.completed when already completed', async () => {
      const handler = vi.fn();
      events.on('episode.completed', handler);

      // Complete the episode
      await tracker.update('user-1', 'ep-1', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Update it again while still complete
      await tracker.update('user-1', 'ep-1', {
        currentSeconds: 1150,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      // Should only fire once (the first time it crossed the threshold)
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits season.completed and series.completed together', async () => {
      const seasonHandler = vi.fn();
      const seriesHandler = vi.fn();
      events.on('season.completed', seasonHandler);
      events.on('series.completed', seriesHandler);

      // Single episode series — completing it completes both season and series
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(seasonHandler).toHaveBeenCalledTimes(1);
      expect(seriesHandler).toHaveBeenCalledTimes(1);
    });
  });
});
