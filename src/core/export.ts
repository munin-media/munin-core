/**
 * Export/Import — full data portability. Users own their data.
 * Supports JSON export, resume position export for relay integration,
 * and data import with conflict resolution.
 */

import type { StorageBackend } from '../storage/types.js';
import type {
  ExportOptions,
  ExportBundle,
  ResumeExport,
  ImportOptions,
  ImportResult,
} from '../types/contributions.js';
import type { ProgressEntry } from '../types/progress.js';
import type { UserRating } from '../types/ratings.js';
import type { Collection } from '../types/collections.js';
import type { UserDataBundle } from '../types/config.js';

export interface ExportModuleOptions {
  storage: StorageBackend;
}

export class ExportModule {
  private storage: StorageBackend;

  constructor(options: ExportModuleOptions) {
    this.storage = options.storage;
  }

  /**
   * Export all user data as a versioned bundle.
   * Supports category filtering via `include` and date range filtering.
   */
  async all(userId: string, options?: ExportOptions): Promise<ExportBundle> {
    const includeCategories = options?.include ?? ['progress', 'ratings', 'collections'];
    const dateRange = options?.dateRange;

    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date(),
      userId,
      data: {},
    };

    if (includeCategories.includes('progress')) {
      let progress = await this.storage.getAllProgress(userId);
      if (dateRange) {
        progress = progress.filter((entry) => {
          const entryDate = entry.lastUpdated;
          return entryDate >= dateRange.from && entryDate <= dateRange.to;
        });
      }
      bundle.data.progress = progress;
    }

    if (includeCategories.includes('ratings')) {
      let ratings = await this.storage.getAllRatings(userId);
      if (dateRange) {
        ratings = ratings.filter((entry) => {
          const entryDate = entry.ratedAt;
          return entryDate >= dateRange.from && entryDate <= dateRange.to;
        });
      }
      bundle.data.ratings = ratings;
    }

    if (includeCategories.includes('collections')) {
      let collections = await this.storage.getCollections(userId);
      if (dateRange) {
        collections = collections.filter((entry) => {
          const entryDate = entry.createdAt;
          return entryDate >= dateRange.from && entryDate <= dateRange.to;
        });
      }
      bundle.data.collections = collections;
    }

    return bundle;
  }

  /**
   * Legacy exportAll — delegates to storage.exportAll for backward compat.
   */
  async exportAll(userId: string, _options?: ExportOptions): Promise<UserDataBundle> {
    return this.storage.exportAll(userId);
  }

  /**
   * Export resume positions for in-progress items.
   * Designed to be consumed by a generic streaming relay.
   * Sorted by lastUpdated descending.
   */
  async resumePositions(userId: string): Promise<ResumeExport> {
    const progress = await this.storage.getAllProgress(userId);

    const inProgress = progress
      .filter((p) => !p.isCompleted && p.currentSeconds > 0)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    return {
      exportedAt: new Date(),
      userId,
      items: inProgress.map((p) => ({
        titleId: p.titleId,
        resumeSeconds: p.currentSeconds,
        percent: p.percent,
        type: p.type,
        seriesId: p.seriesId,
        seasonNumber: p.seasonNumber,
        episodeNumber: p.episodeNumber,
      })),
    };
  }

  /**
   * Import data from an ExportBundle into a user's account.
   * Does NOT emit events (bulk operation — avoids event storm).
   *
   * @param userId - Target user ID
   * @param data - ExportBundle to import
   * @param options - Import options (conflict strategy defaults to 'skip')
   */
  async importData(
    userId: string,
    data: ExportBundle,
    options?: ImportOptions,
  ): Promise<ImportResult> {
    const strategy = options?.conflictStrategy ?? 'skip';
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    // Import progress entries
    if (data.data.progress) {
      for (const entry of data.data.progress) {
        const titleId = (entry as unknown as Record<string, unknown>).titleId as string | undefined;
        try {
          if (!this.isValidProgressEntry(entry)) {
            result.errors++;
            result.details.push({
              titleId: titleId ?? 'unknown',
              action: 'error',
              reason: 'Invalid progress entry',
            });
            continue;
          }

          const existing = await this.storage.getProgress(userId, entry.titleId);

          if (existing) {
            if (strategy === 'skip') {
              result.skipped++;
              result.details.push({
                titleId: entry.titleId,
                action: 'skipped',
                reason: 'Already exists',
              });
            } else {
              // overwrite
              const imported: ProgressEntry = {
                ...entry,
                userId,
                lastUpdated: entry.lastUpdated instanceof Date ? entry.lastUpdated : new Date(entry.lastUpdated),
              };
              await this.storage.setProgress(imported);
              result.imported++;
              result.details.push({
                titleId: entry.titleId,
                action: 'imported',
              });
            }
          } else {
            const imported: ProgressEntry = {
              ...entry,
              userId,
              lastUpdated: entry.lastUpdated instanceof Date ? entry.lastUpdated : new Date(entry.lastUpdated),
            };
            await this.storage.setProgress(imported);
            result.imported++;
            result.details.push({
              titleId: entry.titleId,
              action: 'imported',
            });
          }
        } catch {
          result.errors++;
          result.details.push({
            titleId: titleId ?? 'unknown',
            action: 'error',
            reason: 'Storage error',
          });
        }
      }
    }

    // Import ratings
    if (data.data.ratings) {
      for (const entry of data.data.ratings) {
        const titleId = (entry as unknown as Record<string, unknown>).titleId as string | undefined;
        try {
          if (!this.isValidRating(entry)) {
            result.errors++;
            result.details.push({
              titleId: titleId ?? 'unknown',
              action: 'error',
              reason: 'Invalid rating entry',
            });
            continue;
          }

          const existing = await this.storage.getRating(userId, entry.titleId);

          if (existing) {
            if (strategy === 'skip') {
              result.skipped++;
              result.details.push({
                titleId: entry.titleId,
                action: 'skipped',
                reason: 'Already exists',
              });
            } else {
              // overwrite
              const imported: UserRating = {
                ...entry,
                userId,
                ratedAt: entry.ratedAt instanceof Date ? entry.ratedAt : new Date(entry.ratedAt),
              };
              await this.storage.setRating(imported);
              result.imported++;
              result.details.push({
                titleId: entry.titleId,
                action: 'imported',
              });
            }
          } else {
            const imported: UserRating = {
              ...entry,
              userId,
              ratedAt: entry.ratedAt instanceof Date ? entry.ratedAt : new Date(entry.ratedAt),
            };
            await this.storage.setRating(imported);
            result.imported++;
            result.details.push({
              titleId: entry.titleId,
              action: 'imported',
            });
          }
        } catch {
          result.errors++;
          result.details.push({
            titleId: titleId ?? 'unknown',
            action: 'error',
            reason: 'Storage error',
          });
        }
      }
    }

    // Import collections — always create as new (generate new IDs)
    if (data.data.collections) {
      for (const entry of data.data.collections) {
        const collectionId = (entry as unknown as Record<string, unknown>).collectionId as string | undefined;
        try {
          if (!this.isValidCollection(entry)) {
            result.errors++;
            result.details.push({
              titleId: collectionId ?? 'unknown',
              action: 'error',
              reason: 'Invalid collection entry',
            });
            continue;
          }

          const imported: Collection = {
            ...entry,
            collectionId: crypto.randomUUID(),
            userId,
            createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
            updatedAt: new Date(),
          };
          await this.storage.setCollection(imported);
          result.imported++;
          result.details.push({
            titleId: entry.collectionId,
            action: 'imported',
          });
        } catch {
          result.errors++;
          result.details.push({
            titleId: collectionId ?? 'unknown',
            action: 'error',
            reason: 'Storage error',
          });
        }
      }
    }

    return result;
  }

  /**
   * Delete all user data (GDPR right to erasure).
   */
  async deleteAllUserData(userId: string): Promise<void> {
    // Calls storage.deleteAll which returns counts, but this legacy method ignores them
    await this.storage.deleteAll(userId);
  }

  private isValidProgressEntry(entry: unknown): entry is ProgressEntry {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.titleId === 'string' &&
      e.titleId.length > 0 &&
      (e.type === 'movie' || e.type === 'episode') &&
      typeof e.currentSeconds === 'number' &&
      typeof e.durationSeconds === 'number' &&
      typeof e.percent === 'number'
    );
  }

  private isValidRating(entry: unknown): entry is UserRating {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.titleId === 'string' &&
      e.titleId.length > 0 &&
      typeof e.score === 'number' &&
      Array.isArray(e.tags)
    );
  }

  private isValidCollection(entry: unknown): entry is Collection {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.name === 'string' &&
      e.name.length > 0 &&
      (e.type === 'manual' || e.type === 'smart') &&
      Array.isArray(e.items)
    );
  }
}
