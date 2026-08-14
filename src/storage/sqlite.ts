/**
 * SQLite storage backend for embedded/local deployments.
 * Single-file database, no network dependency.
 */

import type { StorageBackend, DeletionCounts } from './types.js';
import type { ProgressEntry, SeriesProgress } from '../types/progress.js';
import type { UserRating, TagAffinityProfile } from '../types/ratings.js';
import type { Collection } from '../types/collections.js';
import type { ContributionEntry } from '../types/contributions.js';
import type { UserDataBundle } from '../types/config.js';

export class SQLiteBackend implements StorageBackend {
  // TODO: Import and use better-sqlite3
  // private db: Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    // TODO: Initialize SQLite connection
    // this.db = new Database(dbPath);
  }

  async initialize(): Promise<void> {
    // TODO: Create tables if they don't exist:
    // - progress (userId, titleId, type, currentSeconds, durationSeconds, percent, isCompleted, lastUpdated, deviceId)
    // - series_progress (userId, seriesId, json_data, overallPercent, lastUpdated)
    // - ratings (userId, titleId, score, tags_json, notes, ratedAt)
    // - affinity_profiles (userId, affinities_json, lastCalculated)
    // - collections (userId, collectionId, name, type, items_json, smartFilter_json, createdAt, updatedAt)
    // - contributions (userId, contributionId, titleId, title, type, year, language, tags_json, region, studio, description, submittedAt)
  }

  async getProgress(userId: string, titleId: string): Promise<ProgressEntry | null> {
    // TODO: SELECT from progress WHERE userId = ? AND titleId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setProgress(entry: ProgressEntry): Promise<void> {
    // TODO: INSERT OR REPLACE into progress
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress | null> {
    // TODO: SELECT from series_progress WHERE userId = ? AND seriesId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setSeriesProgress(entry: SeriesProgress): Promise<void> {
    // TODO: INSERT OR REPLACE into series_progress
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getAllProgress(userId: string): Promise<ProgressEntry[]> {
    // TODO: SELECT from progress WHERE userId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getRating(userId: string, titleId: string): Promise<UserRating | null> {
    // TODO: SELECT from ratings WHERE userId = ? AND titleId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setRating(rating: UserRating): Promise<void> {
    // TODO: INSERT OR REPLACE into ratings
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getAllRatings(userId: string): Promise<UserRating[]> {
    // TODO: SELECT from ratings WHERE userId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async deleteRating(userId: string, titleId: string): Promise<boolean> {
    // TODO: DELETE from ratings WHERE userId = ? AND titleId = ?, return changes > 0
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getAffinityProfile(userId: string): Promise<TagAffinityProfile | null> {
    // TODO: SELECT from affinity_profiles WHERE userId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setAffinityProfile(userId: string, profile: TagAffinityProfile): Promise<void> {
    // TODO: INSERT OR REPLACE into affinity_profiles
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getCollection(userId: string, collectionId: string): Promise<Collection | null> {
    // TODO: SELECT from collections WHERE userId = ? AND collectionId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getCollections(userId: string): Promise<Collection[]> {
    // TODO: SELECT from collections WHERE userId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setCollection(collection: Collection): Promise<void> {
    // TODO: INSERT OR REPLACE into collections
    throw new Error('SQLiteBackend not yet implemented');
  }

  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    // TODO: DELETE from collections WHERE userId = ? AND collectionId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getContribution(userId: string, contributionId: string): Promise<ContributionEntry | null> {
    // TODO: SELECT from contributions WHERE userId = ? AND contributionId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async getContributions(userId: string): Promise<ContributionEntry[]> {
    // TODO: SELECT from contributions WHERE userId = ?
    throw new Error('SQLiteBackend not yet implemented');
  }

  async setContribution(entry: ContributionEntry): Promise<void> {
    // TODO: INSERT OR REPLACE into contributions
    throw new Error('SQLiteBackend not yet implemented');
  }

  async deleteContributions(userId: string): Promise<number> {
    // TODO: DELETE from contributions WHERE userId = ?, return changes
    throw new Error('SQLiteBackend not yet implemented');
  }

  async exportAll(userId: string): Promise<UserDataBundle> {
    // TODO: Aggregate all tables for userId
    throw new Error('SQLiteBackend not yet implemented');
  }

  async deleteAll(userId: string): Promise<DeletionCounts> {
    // TODO: DELETE from all tables WHERE userId = ?
    // GDPR right to erasure — complete purge
    throw new Error('SQLiteBackend not yet implemented');
  }

  async close(): Promise<void> {
    // TODO: Close SQLite connection
    // this.db.close();
  }
}
