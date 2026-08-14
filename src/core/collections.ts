/**
 * Collections & Lists — user-organized content groupings.
 * Supports manual lists and smart filters (auto-populated by rules).
 *
 * Manual collections: items are stored directly by the user.
 * Smart collections: items are computed dynamically from user ratings and progress.
 */

import type { StorageBackend } from '../storage/types.js';
import type { Collection, CreateCollectionInput, UpdateCollectionInput, SmartFilter } from '../types/collections.js';
import { NotFoundError, ConflictError } from '../errors.js';

export interface CollectionsModuleOptions {
  storage: StorageBackend;
}

export class CollectionsModule {
  private storage: StorageBackend;

  constructor(options: CollectionsModuleOptions) {
    this.storage = options.storage;
  }

  async create(userId: string, input: CreateCollectionInput): Promise<Collection> {
    // Validate name is required
    if (!input.name || input.name.trim() === '') {
      throw new Error('Collection name is required.');
    }

    // Validate smart collections must have a smartFilter
    if (input.type === 'smart' && !input.smartFilter) {
      throw new Error('Smart collections require a smartFilter.');
    }

    const collection: Collection = {
      collectionId: crypto.randomUUID(),
      userId,
      name: input.name,
      type: input.type,
      items: input.type === 'manual' ? (input.items ?? []) : [],
      smartFilter: input.type === 'smart' ? input.smartFilter : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.setCollection(collection);
    return collection;
  }

  async get(userId: string, collectionId: string): Promise<Collection | null> {
    const collection = await this.storage.getCollection(userId, collectionId);
    if (!collection) return null;

    if (collection.type === 'smart') {
      return this.resolveSmartCollection(collection);
    }

    return collection;
  }

  async getAll(userId: string): Promise<Collection[]> {
    const collections = await this.storage.getCollections(userId);

    // Resolve smart collection items
    const resolved: Collection[] = [];
    for (const collection of collections) {
      if (collection.type === 'smart') {
        resolved.push(await this.resolveSmartCollection(collection));
      } else {
        resolved.push(collection);
      }
    }

    return resolved;
  }

  async update(userId: string, collectionId: string, input: UpdateCollectionInput): Promise<Collection> {
    const existing = await this.storage.getCollection(userId, collectionId);
    if (!existing) {
      throw new NotFoundError(`Collection '${collectionId}' not found.`);
    }

    const updated: Collection = {
      ...existing,
      name: input.name ?? existing.name,
      smartFilter: existing.type === 'smart'
        ? (input.smartFilter ?? existing.smartFilter)
        : existing.smartFilter,
      updatedAt: new Date(),
    };

    await this.storage.setCollection(updated);

    if (updated.type === 'smart') {
      return this.resolveSmartCollection(updated);
    }

    return updated;
  }

  async delete(userId: string, collectionId: string): Promise<boolean> {
    const existing = await this.storage.getCollection(userId, collectionId);
    if (!existing) return false;

    await this.storage.deleteCollection(userId, collectionId);
    return true;
  }

  async addItem(userId: string, collectionId: string, titleId: string): Promise<Collection> {
    const existing = await this.storage.getCollection(userId, collectionId);
    if (!existing) {
      throw new NotFoundError(`Collection '${collectionId}' not found.`);
    }

    if (existing.type === 'smart') {
      throw new ConflictError('Cannot manually add items to a smart collection.');
    }

    // Prevent duplicates silently
    if (!existing.items.includes(titleId)) {
      existing.items.push(titleId);
      existing.updatedAt = new Date();
      await this.storage.setCollection(existing);
    }

    return existing;
  }

  async removeItem(userId: string, collectionId: string, titleId: string): Promise<Collection> {
    const existing = await this.storage.getCollection(userId, collectionId);
    if (!existing) {
      throw new NotFoundError(`Collection '${collectionId}' not found.`);
    }

    if (existing.type === 'smart') {
      throw new ConflictError('Cannot manually remove items from a smart collection.');
    }

    existing.items = existing.items.filter((id) => id !== titleId);
    existing.updatedAt = new Date();
    await this.storage.setCollection(existing);

    return existing;
  }

  /**
   * Evaluate a smart collection's filter against user ratings and progress.
   * All filter criteria are AND-combined.
   */
  private async resolveSmartCollection(collection: Collection): Promise<Collection> {
    const filter = collection.smartFilter;
    if (!filter) {
      return { ...collection, items: [] };
    }

    const items = await this.evaluateSmartFilter(collection.userId, filter);
    return { ...collection, items };
  }

  private async evaluateSmartFilter(userId: string, filter: SmartFilter): Promise<string[]> {
    const ratings = await this.storage.getAllRatings(userId);
    const progress = await this.storage.getAllProgress(userId);

    // Start with all known titleIds from ratings and progress
    const allTitleIds = new Set<string>();
    for (const r of ratings) allTitleIds.add(r.titleId);
    for (const p of progress) allTitleIds.add(p.titleId);

    let candidates = [...allTitleIds];

    // Apply minRating filter
    if (filter.minRating !== undefined) {
      const qualifyingTitles = new Set(
        ratings
          .filter((r) => r.score >= filter.minRating!)
          .map((r) => r.titleId),
      );
      candidates = candidates.filter((id) => qualifyingTitles.has(id));
    }

    // Apply tags filter (ANY match)
    if (filter.tags && filter.tags.length > 0) {
      const filterTags = new Set(filter.tags);
      const qualifyingTitles = new Set(
        ratings
          .filter((r) => r.tags.some((tag) => filterTags.has(tag)))
          .map((r) => r.titleId),
      );
      candidates = candidates.filter((id) => qualifyingTitles.has(id));
    }

    // Apply isCompleted filter
    if (filter.isCompleted !== undefined) {
      const progressMap = new Map(progress.map((p) => [p.titleId, p]));
      candidates = candidates.filter((id) => {
        const entry = progressMap.get(id);
        if (filter.isCompleted) {
          // Include only completed titles
          return entry?.isCompleted === true;
        } else {
          // Include only non-completed titles (including those with no progress)
          return !entry?.isCompleted;
        }
      });
    }

    // Apply type filter
    if (filter.type) {
      const progressMap = new Map(progress.map((p) => [p.titleId, p]));
      candidates = candidates.filter((id) => {
        const entry = progressMap.get(id);
        return entry?.type === filter.type;
      });
    }

    return candidates;
  }
}
