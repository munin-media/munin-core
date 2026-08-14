/**
 * Contribution Pipeline — users submit niche media that doesn't exist in connected databases.
 * Stored locally first, optionally forwarded to metadata databases via adapters.
 */

import type { StorageBackend } from '../storage/types.js';
import type { MediaDatabaseAdapter } from '../adapters/types.js';
import type { ContributionEntry, ContributionInput, ContributionResult } from '../types/contributions.js';
import type { MuninEventEmitter } from './events.js';
import { ValidationError } from '../errors.js';

export interface ContributionsModuleOptions {
  storage: StorageBackend;
  adapters: MediaDatabaseAdapter[];
  events: MuninEventEmitter;
}

export class ContributionsModule {
  private storage: StorageBackend;
  private adapters: MediaDatabaseAdapter[];
  private events: MuninEventEmitter;

  constructor(options: ContributionsModuleOptions) {
    this.storage = options.storage;
    this.adapters = options.adapters;
    this.events = options.events;
  }

  async submit(userId: string, input: ContributionInput): Promise<ContributionResult> {
    // Validate required fields
    if (!input.title || input.title.trim() === '') {
      throw new ValidationError('Contribution title is required.');
    }
    if (!input.type) {
      throw new ValidationError('Contribution type is required.');
    }

    const contributionId = crypto.randomUUID();
    const titleId = `contrib:${crypto.randomUUID()}`;

    const entry: ContributionEntry = {
      ...input,
      contributionId,
      userId,
      titleId,
      submittedAt: new Date(),
    };

    // Store locally
    await this.storage.setContribution(entry);

    // Try forwarding to adapters that support contributions
    let adapterResult: ContributionResult | null = null;
    for (const adapter of this.adapters) {
      if (adapter.submitContribution) {
        try {
          adapterResult = await adapter.submitContribution(entry);
          break;
        } catch {
          // Continue to next adapter on failure
        }
      }
    }

    // Emit event
    this.events.emit('contribution.submitted', entry);

    // Return result
    return adapterResult ?? {
      status: 'accepted',
      contributionId,
      titleId,
    };
  }

  async get(userId: string, contributionId: string): Promise<ContributionEntry | null> {
    return this.storage.getContribution(userId, contributionId);
  }

  async getAll(userId: string): Promise<ContributionEntry[]> {
    const contributions = await this.storage.getContributions(userId);
    // Sort by submittedAt descending
    return contributions.sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    );
  }
}
