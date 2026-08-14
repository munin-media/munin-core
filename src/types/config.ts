/**
 * Configuration interfaces for Munin Core initialization.
 */

import type { StorageBackend } from '../storage/types.js';
import type { MediaDatabaseAdapter } from '../adapters/types.js';

export type ConflictResolution = 'latest-wins' | 'longest-progress';

export interface MuninConfig {
  /** Storage backend implementation (Firestore, SQLite, or in-memory) */
  storage: StorageBackend;

  /** Connected metadata database adapters */
  adapters?: MediaDatabaseAdapter[];

  /** Percent threshold to mark content as completed (default: 0.9) */
  completionThreshold?: number;

  /** Multi-device conflict resolution strategy (default: 'latest-wins') */
  conflictResolution?: ConflictResolution;

  /** Rating scale maximum (default: 10) */
  maxRatingScore?: number;
}

export interface UserDataBundle {
  progress: import('./progress.js').ProgressEntry[];
  ratings: import('./ratings.js').UserRating[];
  collections: import('./collections.js').Collection[];
  contributions: import('./contributions.js').ContributionEntry[];
  exportedAt: Date;
}
