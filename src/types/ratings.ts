/**
 * Rating and tag interfaces for user content categorization.
 * Tags can come from user input or metadata adapters.
 */

export interface UserRating {
  userId: string;
  titleId: string;
  score: number; // 1-10 (or configurable scale)
  tags: string[];
  notes?: string; // Optional encrypted free-text
  ratedAt: Date;
}

export interface TagAffinityProfile {
  userId: string;
  affinities: Map<string, number>; // tag → weight (0.0 - 1.0)
  lastCalculated: Date;
}

export interface Recommendation {
  titleId: string;
  score: number;
  matchingTags: string[];
  reason: string;
}

export interface CandidateTitle {
  titleId: string;
  tags: string[];
}

export interface RatingInput {
  score: number;
  tags: string[];
  notes?: string;
}
