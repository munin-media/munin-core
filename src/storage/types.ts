/**
 * Storage backend interface — abstraction over Firestore, SQLite, and in-memory backends.
 * All implementations must support the same operations for interchangeability.
 */

import type { ProgressEntry, SeriesProgress } from '../types/progress.js';
import type { UserRating, TagAffinityProfile } from '../types/ratings.js';
import type { Collection } from '../types/collections.js';
import type { ContributionEntry } from '../types/contributions.js';
import type { UserDataBundle } from '../types/config.js';

export interface DeletionCounts {
  progress: number;
  ratings: number;
  collections: number;
  contributions: number;
  affinityProfile: boolean;
}

export interface StorageBackend {
  // User progress
  getProgress(userId: string, titleId: string): Promise<ProgressEntry | null>;
  setProgress(entry: ProgressEntry): Promise<void>;
  getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress | null>;
  setSeriesProgress(entry: SeriesProgress): Promise<void>;
  getAllProgress(userId: string): Promise<ProgressEntry[]>;

  // Ratings
  getRating(userId: string, titleId: string): Promise<UserRating | null>;
  setRating(rating: UserRating): Promise<void>;
  getAllRatings(userId: string): Promise<UserRating[]>;
  deleteRating(userId: string, titleId: string): Promise<boolean>;

  // Tag affinity
  getAffinityProfile(userId: string): Promise<TagAffinityProfile | null>;
  setAffinityProfile(userId: string, profile: TagAffinityProfile): Promise<void>;

  // Collections
  getCollection(userId: string, collectionId: string): Promise<Collection | null>;
  getCollections(userId: string): Promise<Collection[]>;
  setCollection(collection: Collection): Promise<void>;
  deleteCollection(userId: string, collectionId: string): Promise<void>;

  // Contributions
  getContribution(userId: string, contributionId: string): Promise<ContributionEntry | null>;
  getContributions(userId: string): Promise<ContributionEntry[]>;
  setContribution(entry: ContributionEntry): Promise<void>;
  deleteContributions(userId: string): Promise<number>;

  // Bulk operations
  exportAll(userId: string): Promise<UserDataBundle>;
  deleteAll(userId: string): Promise<DeletionCounts>;

  // Lifecycle
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}
