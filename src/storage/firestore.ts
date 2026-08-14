/**
 * Firestore storage backend for cloud deployments.
 * Requires firebase-admin as an optional peer dependency.
 */

import type { StorageBackend, DeletionCounts } from './types.js';
import type { ProgressEntry, SeriesProgress } from '../types/progress.js';
import type { UserRating, TagAffinityProfile } from '../types/ratings.js';
import type { Collection } from '../types/collections.js';
import type { ContributionEntry } from '../types/contributions.js';
import type { UserDataBundle } from '../types/config.js';

export class FirestoreBackend implements StorageBackend {
  // TODO: Accept Firestore instance or config in constructor
  // private db: FirebaseFirestore.Firestore;

  constructor(_config?: { projectId?: string }) {
    // TODO: Initialize Firestore connection
    // this.db = getFirestore();
  }

  async initialize(): Promise<void> {
    // TODO: Verify Firestore connection and create indexes if needed
  }

  async getProgress(userId: string, titleId: string): Promise<ProgressEntry | null> {
    // TODO: Query users/{userId}/progress/{titleId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setProgress(entry: ProgressEntry): Promise<void> {
    // TODO: Write to users/{userId}/progress/{titleId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress | null> {
    // TODO: Query users/{userId}/series/{seriesId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setSeriesProgress(entry: SeriesProgress): Promise<void> {
    // TODO: Write to users/{userId}/series/{seriesId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getAllProgress(userId: string): Promise<ProgressEntry[]> {
    // TODO: Query all documents in users/{userId}/progress
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getRating(userId: string, titleId: string): Promise<UserRating | null> {
    // TODO: Query users/{userId}/ratings/{titleId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setRating(rating: UserRating): Promise<void> {
    // TODO: Write to users/{userId}/ratings/{titleId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getAllRatings(userId: string): Promise<UserRating[]> {
    // TODO: Query all documents in users/{userId}/ratings
    throw new Error('FirestoreBackend not yet implemented');
  }

  async deleteRating(userId: string, titleId: string): Promise<boolean> {
    // TODO: Delete users/{userId}/ratings/{titleId}, return whether it existed
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getAffinityProfile(userId: string): Promise<TagAffinityProfile | null> {
    // TODO: Query users/{userId}/affinityProfile
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setAffinityProfile(userId: string, profile: TagAffinityProfile): Promise<void> {
    // TODO: Write to users/{userId}/affinityProfile
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getCollection(userId: string, collectionId: string): Promise<Collection | null> {
    // TODO: Query users/{userId}/collections/{collectionId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getCollections(userId: string): Promise<Collection[]> {
    // TODO: Query all documents in users/{userId}/collections
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setCollection(collection: Collection): Promise<void> {
    // TODO: Write to users/{userId}/collections/{collectionId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    // TODO: Delete users/{userId}/collections/{collectionId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getContribution(userId: string, contributionId: string): Promise<ContributionEntry | null> {
    // TODO: Query users/{userId}/contributions/{contributionId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async getContributions(userId: string): Promise<ContributionEntry[]> {
    // TODO: Query all documents in users/{userId}/contributions
    throw new Error('FirestoreBackend not yet implemented');
  }

  async setContribution(entry: ContributionEntry): Promise<void> {
    // TODO: Write to users/{userId}/contributions/{contributionId}
    throw new Error('FirestoreBackend not yet implemented');
  }

  async deleteContributions(userId: string): Promise<number> {
    // TODO: Delete all documents in users/{userId}/contributions, return count
    throw new Error('FirestoreBackend not yet implemented');
  }

  async exportAll(userId: string): Promise<UserDataBundle> {
    // TODO: Aggregate all user data from subcollections
    throw new Error('FirestoreBackend not yet implemented');
  }

  async deleteAll(userId: string): Promise<DeletionCounts> {
    // TODO: Delete all subcollections under users/{userId}
    // GDPR right to erasure — complete purge, no tombstones
    throw new Error('FirestoreBackend not yet implemented');
  }

  async close(): Promise<void> {
    // TODO: Cleanup Firestore connection if needed
  }
}
