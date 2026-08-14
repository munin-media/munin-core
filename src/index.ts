/**
 * @munin/core — Zero-knowledge media memory library.
 *
 * Library entry point. Exports the createMunin factory function and all public types.
 */

import type { MuninConfig } from './types/config.js';
import type { DeletionResult } from './types/contributions.js';
import { MuninEventEmitter } from './core/events.js';
import { ProgressTracker } from './core/progress.js';
import { RatingsModule } from './core/ratings.js';
import { RecommendationsEngine } from './core/recommendations.js';
import { CollectionsModule } from './core/collections.js';
import { ContributionsModule } from './core/contributions.js';
import { ExportModule } from './core/export.js';

export interface MuninInstance {
  progress: ProgressTracker;
  ratings: RatingsModule;
  recommendations: RecommendationsEngine;
  collections: CollectionsModule;
  contributions: ContributionsModule;
  export: ExportModule;

  /** Subscribe to Munin events */
  on: MuninEventEmitter['on'];

  /** Unsubscribe from Munin events */
  off: MuninEventEmitter['off'];

  /** Delete all user data (GDPR right to erasure) — returns counts of what was deleted */
  deleteAllUserData(userId: string): Promise<DeletionResult>;

  /** Gracefully close storage connections */
  close(): Promise<void>;
}

/**
 * Create a Munin instance with the given configuration.
 *
 * @example
 * ```typescript
 * import { createMunin } from '@munin/core';
 * import { SQLiteBackend } from '@munin/core/storage/sqlite';
 *
 * const munin = createMunin({
 *   storage: new SQLiteBackend('./munin.db'),
 *   completionThreshold: 0.9,
 *   conflictResolution: 'longest-progress',
 * });
 *
 * await munin.progress.update('user-1', 'title-abc', {
 *   currentSeconds: 2580,
 *   durationSeconds: 3540,
 * });
 * ```
 */
export function createMunin(config: MuninConfig): MuninInstance {
  const events = new MuninEventEmitter();

  const progress = new ProgressTracker({
    storage: config.storage,
    events,
    completionThreshold: config.completionThreshold ?? 0.9,
    conflictResolution: config.conflictResolution ?? 'latest-wins',
  });

  const ratings = new RatingsModule({
    storage: config.storage,
    events,
    maxScore: config.maxRatingScore ?? 10,
  });

  const recommendations = new RecommendationsEngine({
    storage: config.storage,
    ratings,
  });

  // Wire up circular dependency: ratings triggers recalculate on recommendations
  ratings.setRecommendationsEngine(recommendations);

  const collections = new CollectionsModule({
    storage: config.storage,
  });

  const contributions = new ContributionsModule({
    storage: config.storage,
    adapters: config.adapters ?? [],
    events,
  });

  const exportModule = new ExportModule({
    storage: config.storage,
  });

  return {
    progress,
    ratings,
    recommendations,
    collections,
    contributions,
    export: exportModule,
    on: events.on.bind(events),
    off: events.off.bind(events),
    async deleteAllUserData(userId: string): Promise<DeletionResult> {
      // Full permanent purge — no events emitted (user is being erased)
      const counts = await config.storage.deleteAll(userId);
      return {
        deleted: counts,
        timestamp: new Date(),
      };
    },
    async close() {
      await config.storage.close?.();
      events.removeAllListeners();
    },
  };
}

// Re-export types
export type { MuninConfig, UserDataBundle, ConflictResolution } from './types/config.js';
export type { ProgressEntry, SeriesProgress, SeasonProgress, EpisodeProgress, ProgressUpdateInput } from './types/progress.js';
export type { UserRating, TagAffinityProfile, Recommendation, CandidateTitle, RatingInput } from './types/ratings.js';
export type { Collection, SmartFilter, CreateCollectionInput, UpdateCollectionInput } from './types/collections.js';
export type { ContributionEntry, ContributionInput, ContributionResult, DeletionResult, ExportOptions, ExportBundle, ResumeExport, ImportOptions, ImportResult, ImportAdapter, ImportedEntry } from './types/contributions.js';
export type { StorageBackend, DeletionCounts } from './storage/types.js';
export type { MediaDatabaseAdapter, TitleMetadata, SeriesMetadata } from './adapters/types.js';
export type { MuninEvents, ConflictDetectedEvent } from './core/events.js';
export { MuninEventEmitter } from './core/events.js';
export { InMemoryBackend } from './storage/memory.js';
export { SQLiteBackend } from './storage/sqlite.js';
export { FirestoreBackend } from './storage/firestore.js';
export { ManualEntryAdapter } from './adapters/manual.js';
export { createStorageFromEnv } from './config/storage-factory.js';
