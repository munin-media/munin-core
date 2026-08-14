/**
 * Manual entry adapter — allows users to submit their own metadata for niche/local content.
 * This adapter stores entries locally and does not connect to an external database.
 */

import type { MediaDatabaseAdapter, TitleMetadata, SeriesMetadata } from './types.js';
import type { ContributionEntry, ContributionResult } from '../types/contributions.js';

export class ManualEntryAdapter implements MediaDatabaseAdapter {
  readonly name = 'manual-entry';

  private entries: Map<string, TitleMetadata> = new Map();
  private seriesEntries: Map<string, SeriesMetadata> = new Map();

  async getTitle(titleId: string): Promise<TitleMetadata | null> {
    return this.entries.get(titleId) ?? null;
  }

  async getSeries(seriesId: string): Promise<SeriesMetadata | null> {
    return this.seriesEntries.get(seriesId) ?? null;
  }

  async search(query: string): Promise<TitleMetadata[]> {
    const normalizedQuery = query.toLowerCase();
    const results: TitleMetadata[] = [];

    for (const entry of this.entries.values()) {
      if (entry.title.toLowerCase().includes(normalizedQuery)) {
        results.push(entry);
      }
    }

    return results;
  }

  async getTagsForTitle(titleId: string): Promise<string[]> {
    const title = this.entries.get(titleId);
    return title?.tags ?? [];
  }

  async submitContribution(entry: ContributionEntry): Promise<ContributionResult> {
    const titleId = entry.titleId;

    const metadata: TitleMetadata = {
      titleId,
      title: entry.title,
      type: entry.type,
      tags: entry.tags,
      year: entry.year,
      language: entry.language,
      region: entry.region,
    };

    this.entries.set(titleId, metadata);

    // If it's a series, also store as SeriesMetadata
    if (entry.type === 'series') {
      const seriesMeta: SeriesMetadata = {
        seriesId: titleId,
        title: entry.title,
        totalSeasons: 0,
        totalEpisodes: 0,
        tags: entry.tags,
        year: entry.year,
        language: entry.language,
        region: entry.region,
      };
      this.seriesEntries.set(titleId, seriesMeta);
    }

    return {
      status: 'accepted',
      contributionId: entry.contributionId,
      titleId,
    };
  }
}
