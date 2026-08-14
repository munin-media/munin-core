/**
 * Progress Tracker — per-item, per-season, per-series progress with resume position.
 * Auto-calculates series/season percentages from episode data.
 */

import type { StorageBackend } from '../storage/types.js';
import type {
  ProgressEntry,
  SeriesProgress,
  SeasonProgress,
  EpisodeProgress,
  ProgressUpdateInput,
} from '../types/progress.js';
import type { MuninEventEmitter } from './events.js';
import type { ConflictResolution } from '../types/config.js';

export interface ProgressTrackerOptions {
  storage: StorageBackend;
  events: MuninEventEmitter;
  completionThreshold: number;
  conflictResolution: ConflictResolution;
}

export class ProgressTracker {
  private storage: StorageBackend;
  private events: MuninEventEmitter;
  private completionThreshold: number;
  private conflictResolution: ConflictResolution;

  constructor(options: ProgressTrackerOptions) {
    this.storage = options.storage;
    this.events = options.events;
    this.completionThreshold = options.completionThreshold;
    this.conflictResolution = options.conflictResolution;
  }

  async update(userId: string, titleId: string, input: ProgressUpdateInput): Promise<ProgressEntry> {
    const existing = await this.storage.getProgress(userId, titleId);

    const percent = input.durationSeconds > 0
      ? input.currentSeconds / input.durationSeconds
      : 0;

    const isCompleted = percent >= this.completionThreshold;
    const wasCompleted = existing?.isCompleted ?? false;
    const newlyCompleted = isCompleted && !wasCompleted;

    // Determine if there's a multi-device conflict
    const hasDeviceId = !!input.deviceId;
    const existingHasDifferentDevice = existing !== null
      && hasDeviceId
      && !!existing.deviceId
      && existing.deviceId !== input.deviceId;

    // Track all device IDs that have contributed
    let lastDeviceIds = existing?.lastDeviceIds ?? [];
    if (hasDeviceId && !lastDeviceIds.includes(input.deviceId!)) {
      lastDeviceIds = [...lastDeviceIds, input.deviceId!];
    }

    // Apply conflict resolution when devices differ
    if (existingHasDifferentDevice) {
      const strategy = this.conflictResolution;

      if (strategy === 'longest-progress') {
        // Only overwrite if new entry has more progress
        if (input.currentSeconds > existing!.currentSeconds) {
          // New entry wins — proceed with full overwrite
          this.events.emit('progress.conflict', {
            userId,
            titleId,
            existingDeviceId: existing!.deviceId!,
            incomingDeviceId: input.deviceId!,
            resolution: strategy,
            accepted: true,
          });
        } else {
          // Existing entry wins — keep progress values but update metadata
          const entry: ProgressEntry = {
            ...existing!,
            lastUpdated: new Date(),
            lastDeviceIds,
          };

          await this.storage.setProgress(entry);
          this.events.emit('progress.updated', entry);
          this.events.emit('progress.conflict', {
            userId,
            titleId,
            existingDeviceId: existing!.deviceId!,
            incomingDeviceId: input.deviceId!,
            resolution: strategy,
            accepted: false,
          });

          return entry;
        }
      } else {
        // latest-wins: always overwrite
        this.events.emit('progress.conflict', {
          userId,
          titleId,
          existingDeviceId: existing!.deviceId!,
          incomingDeviceId: input.deviceId!,
          resolution: strategy,
          accepted: true,
        });
      }
    }

    const entry: ProgressEntry = {
      userId,
      titleId,
      type: input.type,
      currentSeconds: input.currentSeconds,
      durationSeconds: input.durationSeconds,
      percent,
      isCompleted,
      lastUpdated: new Date(),
      deviceId: input.deviceId,
      lastDeviceIds: lastDeviceIds.length > 0 ? lastDeviceIds : undefined,
      seriesId: input.seriesId,
      seasonId: input.seasonId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
    };

    await this.storage.setProgress(entry);
    this.events.emit('progress.updated', entry);

    if (input.type === 'episode' && input.seriesId && input.seasonId) {
      await this.updateSeriesProgress(userId, input.seriesId, titleId, newlyCompleted);
    }

    if (input.type === 'episode' && newlyCompleted) {
      this.events.emit('episode.completed', entry);
    }

    return entry;
  }

  async get(userId: string, titleId: string): Promise<ProgressEntry | null> {
    return this.storage.getProgress(userId, titleId);
  }

  async getAll(userId: string): Promise<ProgressEntry[]> {
    return this.storage.getAllProgress(userId);
  }

  async getSeries(userId: string, seriesId: string): Promise<SeriesProgress | null> {
    return this.storage.getSeriesProgress(userId, seriesId);
  }

  async getInProgress(userId: string, options?: { limit?: number; offset?: number }): Promise<ProgressEntry[]> {
    const allProgress = await this.storage.getAllProgress(userId);

    const inProgress = allProgress
      .filter((entry) => !entry.isCompleted)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? inProgress.length;

    return inProgress.slice(offset, offset + limit);
  }

  private async updateSeriesProgress(
    userId: string,
    seriesId: string,
    lastWatchedEpisodeId: string,
    newlyCompleted: boolean,
  ): Promise<void> {
    // Get all episode entries for this series
    const allProgress = await this.storage.getAllProgress(userId);
    const seriesEpisodes = allProgress.filter(
      (entry) => entry.type === 'episode' && entry.seriesId === seriesId,
    );

    // Group episodes by season
    const seasonMap = new Map<string, ProgressEntry[]>();
    for (const ep of seriesEpisodes) {
      const seasonKey = ep.seasonId ?? 'unknown';
      if (!seasonMap.has(seasonKey)) {
        seasonMap.set(seasonKey, []);
      }
      seasonMap.get(seasonKey)!.push(ep);
    }

    // Build season progress
    const seasons: SeasonProgress[] = [];
    let totalEpisodes = 0;
    let completedEpisodes = 0;

    // Track which seasons were previously complete (to detect new completions)
    const existingSeries = await this.storage.getSeriesProgress(userId, seriesId);
    const previouslyCompletedSeasons = new Set<string>();
    if (existingSeries) {
      for (const season of existingSeries.seasons) {
        if (season.completedEpisodes === season.totalEpisodes && season.totalEpisodes > 0) {
          previouslyCompletedSeasons.add(season.seasonId);
        }
      }
    }

    for (const [seasonId, episodes] of seasonMap) {
      const seasonEpisodes: EpisodeProgress[] = episodes.map((ep) => ({
        episodeId: ep.titleId,
        episodeNumber: ep.episodeNumber ?? 0,
        currentSeconds: ep.currentSeconds,
        durationSeconds: ep.durationSeconds,
        percent: ep.percent,
        isCompleted: ep.isCompleted,
      }));

      seasonEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

      const seasonCompleted = seasonEpisodes.filter((e) => e.isCompleted).length;
      const seasonTotal = seasonEpisodes.length;
      const seasonPercent = seasonTotal > 0 ? seasonCompleted / seasonTotal : 0;
      const seasonNumber = episodes[0]?.seasonNumber ?? 0;

      seasons.push({
        seasonId,
        seasonNumber,
        episodes: seasonEpisodes,
        percent: seasonPercent,
        totalEpisodes: seasonTotal,
        completedEpisodes: seasonCompleted,
      });

      totalEpisodes += seasonTotal;
      completedEpisodes += seasonCompleted;

      // Emit season.completed if this season is now complete and wasn't before
      if (newlyCompleted && seasonCompleted === seasonTotal && seasonTotal > 0 && !previouslyCompletedSeasons.has(seasonId)) {
        this.events.emit('season.completed', { userId, seriesId, seasonNumber });
      }
    }

    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

    const overallPercent = totalEpisodes > 0 ? completedEpisodes / totalEpisodes : 0;

    const seriesProgress: SeriesProgress = {
      userId,
      seriesId,
      seasons,
      overallPercent,
      totalEpisodes,
      completedEpisodes,
      lastWatchedEpisodeId,
      lastUpdated: new Date(),
    };

    await this.storage.setSeriesProgress(seriesProgress);

    // Emit series.completed if all episodes are done and wasn't already complete
    const wasSeriesComplete = existingSeries
      ? existingSeries.completedEpisodes === existingSeries.totalEpisodes && existingSeries.totalEpisodes > 0
      : false;

    if (newlyCompleted && completedEpisodes === totalEpisodes && totalEpisodes > 0 && !wasSeriesComplete) {
      this.events.emit('series.completed', { userId, seriesId });
    }
  }
}
