/**
 * Media database adapter interface — plugin system for connecting to external metadata sources.
 * Adapters are generic; any developer can implement one for any metadata provider.
 */

import type { ContributionEntry, ContributionResult } from '../types/contributions.js';

export interface TitleMetadata {
  titleId: string;
  title: string;
  type: 'movie' | 'series' | 'episode';
  tags: string[];
  year?: number;
  language?: string;
  region?: string;
  [key: string]: unknown;
}

export interface SeriesMetadata {
  seriesId: string;
  title: string;
  totalSeasons: number;
  totalEpisodes: number;
  tags: string[];
  [key: string]: unknown;
}

export interface MediaDatabaseAdapter {
  name: string;

  /** Lookup a title by opaque ID */
  getTitle(titleId: string): Promise<TitleMetadata | null>;

  /** Lookup a series by opaque ID */
  getSeries(seriesId: string): Promise<SeriesMetadata | null>;

  /** Search for titles (used for contribution matching) */
  search(query: string): Promise<TitleMetadata[]>;

  /** Get tags associated with a title */
  getTagsForTitle(titleId: string): Promise<string[]>;

  /** Submit a user contribution (optional capability) */
  submitContribution?(entry: ContributionEntry): Promise<ContributionResult>;
}
