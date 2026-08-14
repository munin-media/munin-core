import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressTracker } from '../../src/core/progress.js';
import { MuninEventEmitter } from '../../src/core/events.js';
import { InMemoryBackend } from '../../src/storage/memory.js';

describe('ProgressTracker — Multi-Device Sync', () => {
  let storage: InMemoryBackend;
  let events: MuninEventEmitter;

  beforeEach(() => {
    storage = new InMemoryBackend();
    events = new MuninEventEmitter();
  });

  function createTracker(conflictResolution: 'latest-wins' | 'longest-progress' = 'latest-wins') {
    return new ProgressTracker({
      storage,
      events,
      completionThreshold: 0.9,
      conflictResolution,
    });
  }

  describe('deviceId tracking', () => {
    it('stores deviceId on entry when provided', async () => {
      const tracker = createTracker();

      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      expect(result.deviceId).toBe('phone-1');
      const stored = await tracker.get('user-1', 'movie-1');
      expect(stored?.deviceId).toBe('phone-1');
    });

    it('first update with deviceId on fresh entry — no conflict', async () => {
      const tracker = createTracker();
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      expect(result.deviceId).toBe('phone-1');
      expect(conflictHandler).not.toHaveBeenCalled();
    });
  });

  describe('same device updates', () => {
    it('update from same device — no conflict, just updates', async () => {
      const tracker = createTracker();
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      expect(result.currentSeconds).toBe(1200);
      expect(result.deviceId).toBe('phone-1');
      expect(conflictHandler).not.toHaveBeenCalled();
    });
  });

  describe('latest-wins strategy', () => {
    it('update from different device with latest-wins — always overwrites', async () => {
      const tracker = createTracker('latest-wins');
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      // Phone watches to 600s
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      // Tablet updates to 300s (less progress, but newer)
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 300,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      // latest-wins: tablet update wins even with less progress
      expect(result.currentSeconds).toBe(300);
      expect(result.deviceId).toBe('tablet-1');
      expect(conflictHandler).toHaveBeenCalledTimes(1);
      expect(conflictHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          titleId: 'movie-1',
          existingDeviceId: 'phone-1',
          incomingDeviceId: 'tablet-1',
          resolution: 'latest-wins',
          accepted: true,
        }),
      );
    });

    it('conflict resolution defaults to latest-wins when not configured', async () => {
      // Default is latest-wins
      const tracker = createTracker();
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 300,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      // Overwrites even though progress is less
      expect(result.currentSeconds).toBe(300);
      expect(conflictHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: 'latest-wins',
          accepted: true,
        }),
      );
    });
  });

  describe('longest-progress strategy', () => {
    it('update from different device with longest-progress — overwrites if further', async () => {
      const tracker = createTracker('longest-progress');
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      // Phone watches to 600s
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      // Tablet updates to 1200s (more progress)
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      // New entry has more progress — wins
      expect(result.currentSeconds).toBe(1200);
      expect(result.deviceId).toBe('tablet-1');
      expect(conflictHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: 'longest-progress',
          accepted: true,
        }),
      );
    });

    it('update from different device with longest-progress — keeps existing if new is shorter', async () => {
      const tracker = createTracker('longest-progress');
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      // Phone watches to 1200s
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      // Tablet updates to 600s (less progress)
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      // Existing entry has more progress — keeps existing values
      expect(result.currentSeconds).toBe(1200);
      expect(result.deviceId).toBe('phone-1'); // keeps original device
      expect(result.lastDeviceIds).toContain('phone-1');
      expect(result.lastDeviceIds).toContain('tablet-1');
      expect(conflictHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: 'longest-progress',
          accepted: false,
        }),
      );
    });
  });

  describe('no deviceId', () => {
    it('no deviceId provided — no conflict logic applied (behaves as before)', async () => {
      const tracker = createTracker('longest-progress');
      const conflictHandler = vi.fn();
      events.on('progress.conflict', conflictHandler);

      // First update without deviceId
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
      });

      // Second update without deviceId — no conflict even with longest-progress
      const result = await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
      });

      // Should simply overwrite (no conflict logic)
      expect(result.currentSeconds).toBe(600);
      expect(conflictHandler).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('progress.updated event still emits on conflict resolution (whether or not overwritten)', async () => {
      const tracker = createTracker('longest-progress');
      const updateHandler = vi.fn();
      events.on('progress.updated', updateHandler);

      // Phone watches to 1200s
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      // Tablet updates to 600s (rejected by longest-progress, but event should still emit)
      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      // progress.updated should have been called twice
      expect(updateHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('completion with conflict resolution', () => {
    it('completion detection still works correctly with conflict resolution', async () => {
      const tracker = createTracker('latest-wins');
      const completedHandler = vi.fn();
      events.on('episode.completed', completedHandler);

      // Phone starts episode
      await tracker.update('user-1', 'ep-1', {
        currentSeconds: 600,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
        deviceId: 'phone-1',
      });

      // Tablet completes the episode (conflict + completion)
      const result = await tracker.update('user-1', 'ep-1', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
        deviceId: 'tablet-1',
      });

      expect(result.isCompleted).toBe(true);
      expect(completedHandler).toHaveBeenCalledTimes(1);
      expect(completedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          titleId: 'ep-1',
          isCompleted: true,
          deviceId: 'tablet-1',
        }),
      );
    });
  });

  describe('series progress with multi-device', () => {
    it('series progress updates correctly even with multi-device conflicts', async () => {
      const tracker = createTracker('latest-wins');

      // Phone: start episode 1
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 600,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
        deviceId: 'phone-1',
      });

      // Tablet: complete episode 1 (different device)
      await tracker.update('user-1', 'ep-s01e01', {
        currentSeconds: 1100,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 1,
        deviceId: 'tablet-1',
      });

      // Phone: start episode 2
      await tracker.update('user-1', 'ep-s01e02', {
        currentSeconds: 300,
        durationSeconds: 1200,
        type: 'episode',
        seriesId: 'series-1',
        seasonId: 'season-1',
        seasonNumber: 1,
        episodeNumber: 2,
        deviceId: 'phone-1',
      });

      const series = await tracker.getSeries('user-1', 'series-1');
      expect(series).not.toBeNull();
      expect(series!.totalEpisodes).toBe(2);
      expect(series!.completedEpisodes).toBe(1);
      expect(series!.seasons[0].episodes).toHaveLength(2);
      expect(series!.seasons[0].episodes[0].isCompleted).toBe(true);
      expect(series!.seasons[0].episodes[1].isCompleted).toBe(false);
    });
  });

  describe('lastDeviceIds tracking', () => {
    it('tracks all devices that have updated an entry', async () => {
      const tracker = createTracker('latest-wins');

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 600,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'phone-1',
      });

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1200,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tablet-1',
      });

      await tracker.update('user-1', 'movie-1', {
        currentSeconds: 1800,
        durationSeconds: 3600,
        type: 'movie',
        deviceId: 'tv-1',
      });

      const stored = await tracker.get('user-1', 'movie-1');
      expect(stored?.lastDeviceIds).toContain('phone-1');
      expect(stored?.lastDeviceIds).toContain('tablet-1');
      expect(stored?.lastDeviceIds).toContain('tv-1');
      expect(stored?.lastDeviceIds).toHaveLength(3);
    });
  });
});
