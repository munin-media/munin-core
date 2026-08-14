/**
 * Contribution pipeline interfaces for user-submitted niche media metadata.
 * Also contains export/import types for data portability.
 */

import type { ProgressEntry } from './progress.js';
import type { UserRating } from './ratings.js';
import type { Collection } from './collections.js';

export interface ContributionInput {
  title: string;
  type: 'movie' | 'series';
  year?: number;
  language?: string;
  tags: string[];
  region?: string;
  studio?: string;
  description?: string;
}

export interface ContributionEntry extends ContributionInput {
  contributionId: string;
  userId: string;
  titleId: string;
  submittedAt: Date;
}

export interface ContributionResult {
  status: 'accepted' | 'queued' | 'rejected';
  contributionId: string;
  titleId: string;
}

export interface DeletionResult {
  deleted: {
    progress: number;
    ratings: number;
    collections: number;
    contributions: number;
    affinityProfile: boolean;
  };
  timestamp: Date;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  include?: ('progress' | 'ratings' | 'collections' | 'contributions')[];
  dateRange?: { from: Date; to: Date };
}

export interface ExportBundle {
  version: 1;
  exportedAt: Date;
  userId: string;
  data: {
    progress?: ProgressEntry[];
    ratings?: UserRating[];
    collections?: Collection[];
  };
}

export interface ResumeExport {
  exportedAt: Date;
  userId: string;
  items: Array<{
    titleId: string;
    resumeSeconds: number;
    percent: number;
    type: 'movie' | 'episode';
    seriesId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  }>;
}

export interface ImportOptions {
  conflictStrategy: 'skip' | 'overwrite';
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: Array<{
    titleId: string;
    action: 'imported' | 'skipped' | 'error';
    reason?: string;
  }>;
}

export interface ImportAdapter {
  name: string;
  parse(data: Buffer | string): Promise<ImportedEntry[]>;
}

export interface ImportedEntry {
  titleId?: string;
  title?: string;
  type?: 'movie' | 'series' | 'episode';
  score?: number;
  tags?: string[];
  progress?: {
    currentSeconds: number;
    durationSeconds: number;
  };
}
