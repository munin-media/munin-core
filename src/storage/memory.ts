/**
 * In-memory storage backend for testing.
 * Fast, no persistence — data is lost when the process exits.
 */

import type { StorageBackend, DeletionCounts } from './types.js';
import type { ProgressEntry, SeriesProgress } from '../types/progress.js';
import type { UserRating, TagAffinityProfile } from '../types/ratings.js';
import type { Collection } from '../types/collections.js';
import type { ContributionEntry } from '../types/contributions.js';
import type { UserDataBundle } from '../types/config.js';

export class InMemoryBackend implements StorageBackend {
  private progress: Map<string, ProgressEntry> = new Map();
  private seriesProgress: Map<string, SeriesProgress> = new Map();
  private ratings: Map<string, UserRating> = new Map();
  private affinityProfiles: Map<string, TagAffinityProfile> = new Map();
  private collections: Map<string, Collection> = new Map();
  private contributions: Map<string, ContributionEntry> = new Map();

  private key(userId: string, id: string): string {
    return `${userId}:${id}`;
  }

  async getProgress(userId: string, titleId: string): Promise<ProgressEntry | null> {
    return this.progress.get(this.key(userId, titleId)) ?? null;
  }

  async setProgress(entry: ProgressEntry): Promise<void> {
    this.progress.set(this.key(entry.userId, entry.titleId), entry);
  }

  async getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress | null> {
    return this.seriesProgress.get(this.key(userId, seriesId)) ?? null;
  }

  async setSeriesProgress(entry: SeriesProgress): Promise<void> {
    this.seriesProgress.set(this.key(entry.userId, entry.seriesId), entry);
  }

  async getAllProgress(userId: string): Promise<ProgressEntry[]> {
    const entries: ProgressEntry[] = [];
    for (const [key, entry] of this.progress) {
      if (key.startsWith(`${userId}:`)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  async getRating(userId: string, titleId: string): Promise<UserRating | null> {
    return this.ratings.get(this.key(userId, titleId)) ?? null;
  }

  async setRating(rating: UserRating): Promise<void> {
    this.ratings.set(this.key(rating.userId, rating.titleId), rating);
  }

  async getAllRatings(userId: string): Promise<UserRating[]> {
    const entries: UserRating[] = [];
    for (const [key, entry] of this.ratings) {
      if (key.startsWith(`${userId}:`)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  async deleteRating(userId: string, titleId: string): Promise<boolean> {
    const key = this.key(userId, titleId);
    if (this.ratings.has(key)) {
      this.ratings.delete(key);
      return true;
    }
    return false;
  }

  async getAffinityProfile(userId: string): Promise<TagAffinityProfile | null> {
    return this.affinityProfiles.get(userId) ?? null;
  }

  async setAffinityProfile(userId: string, profile: TagAffinityProfile): Promise<void> {
    this.affinityProfiles.set(userId, profile);
  }

  async getCollection(userId: string, collectionId: string): Promise<Collection | null> {
    return this.collections.get(this.key(userId, collectionId)) ?? null;
  }

  async getCollections(userId: string): Promise<Collection[]> {
    const entries: Collection[] = [];
    for (const [key, entry] of this.collections) {
      if (key.startsWith(`${userId}:`)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  async setCollection(collection: Collection): Promise<void> {
    this.collections.set(this.key(collection.userId, collection.collectionId), collection);
  }

  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    this.collections.delete(this.key(userId, collectionId));
  }

  async getContribution(userId: string, contributionId: string): Promise<ContributionEntry | null> {
    return this.contributions.get(this.key(userId, contributionId)) ?? null;
  }

  async getContributions(userId: string): Promise<ContributionEntry[]> {
    const entries: ContributionEntry[] = [];
    for (const [key, entry] of this.contributions) {
      if (key.startsWith(`${userId}:`)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  async setContribution(entry: ContributionEntry): Promise<void> {
    this.contributions.set(this.key(entry.userId, entry.contributionId), entry);
  }

  async deleteContributions(userId: string): Promise<number> {
    const prefix = `${userId}:`;
    let count = 0;
    for (const key of this.contributions.keys()) {
      if (key.startsWith(prefix)) {
        this.contributions.delete(key);
        count++;
      }
    }
    return count;
  }

  async exportAll(userId: string): Promise<UserDataBundle> {
    return {
      progress: await this.getAllProgress(userId),
      ratings: await this.getAllRatings(userId),
      collections: await this.getCollections(userId),
      contributions: await this.getContributions(userId),
      exportedAt: new Date(),
    };
  }

  async deleteAll(userId: string): Promise<DeletionCounts> {
    const prefix = `${userId}:`;

    let progressCount = 0;
    for (const key of this.progress.keys()) {
      if (key.startsWith(prefix)) {
        this.progress.delete(key);
        progressCount++;
      }
    }
    // Also delete series progress
    for (const key of this.seriesProgress.keys()) {
      if (key.startsWith(prefix)) {
        this.seriesProgress.delete(key);
      }
    }

    let ratingsCount = 0;
    for (const key of this.ratings.keys()) {
      if (key.startsWith(prefix)) {
        this.ratings.delete(key);
        ratingsCount++;
      }
    }

    let collectionsCount = 0;
    for (const key of this.collections.keys()) {
      if (key.startsWith(prefix)) {
        this.collections.delete(key);
        collectionsCount++;
      }
    }

    let contributionsCount = 0;
    for (const key of this.contributions.keys()) {
      if (key.startsWith(prefix)) {
        this.contributions.delete(key);
        contributionsCount++;
      }
    }

    const hadAffinity = this.affinityProfiles.has(userId);
    this.affinityProfiles.delete(userId);

    return {
      progress: progressCount,
      ratings: ratingsCount,
      collections: collectionsCount,
      contributions: contributionsCount,
      affinityProfile: hadAffinity,
    };
  }
}
