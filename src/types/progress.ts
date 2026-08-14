/**
 * Progress tracking interfaces for media consumption state.
 * All identifiers are opaque — Munin never knows what the content actually is.
 */

export interface ProgressEntry {
  userId: string;
  titleId: string;
  type: 'movie' | 'episode';
  currentSeconds: number;
  durationSeconds: number;
  percent: number; // 0.0 - 1.0
  isCompleted: boolean;
  lastUpdated: Date;
  deviceId?: string;
  lastDeviceIds?: string[];
  seriesId?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface SeriesProgress {
  userId: string;
  seriesId: string;
  seasons: SeasonProgress[];
  overallPercent: number;
  totalEpisodes: number;
  completedEpisodes: number;
  lastWatchedEpisodeId: string;
  lastUpdated: Date;
}

export interface SeasonProgress {
  seasonId: string;
  seasonNumber: number;
  episodes: EpisodeProgress[];
  percent: number;
  totalEpisodes: number;
  completedEpisodes: number;
}

export interface EpisodeProgress {
  episodeId: string;
  episodeNumber: number;
  currentSeconds: number;
  durationSeconds: number;
  percent: number;
  isCompleted: boolean;
}

export interface ProgressUpdateInput {
  currentSeconds: number;
  durationSeconds: number;
  type: 'movie' | 'episode';
  seriesId?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  deviceId?: string;
}
