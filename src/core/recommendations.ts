/**
 * Recommendations Engine — privacy-respecting suggestions based on tag affinity.
 * No ML, no external calls. All scoring happens locally.
 */

import type { StorageBackend } from '../storage/types.js';
import type { TagAffinityProfile, CandidateTitle, Recommendation } from '../types/ratings.js';
import type { RatingsModule } from './ratings.js';

export interface RecommendationsOptions {
  storage: StorageBackend;
  ratings: RatingsModule;
}

export class RecommendationsEngine {
  private storage: StorageBackend;
  private ratings: RatingsModule;

  constructor(options: RecommendationsOptions) {
    this.storage = options.storage;
    this.ratings = options.ratings;
  }

  async getAffinityProfile(userId: string): Promise<TagAffinityProfile> {
    const existing = await this.storage.getAffinityProfile(userId);
    if (existing) return existing;

    // No profile cached — calculate fresh
    return this.recalculateAffinity(userId);
  }

  async recalculateAffinity(userId: string): Promise<TagAffinityProfile> {
    const allRatings = await this.storage.getAllRatings(userId);
    const { min, max } = this.ratings.getScoreRange();

    const affinities = new Map<string, number>();

    if (allRatings.length === 0) {
      const profile: TagAffinityProfile = {
        userId,
        affinities,
        lastCalculated: new Date(),
      };
      await this.storage.setAffinityProfile(userId, profile);
      return profile;
    }

    // Collect normalized scores per tag
    const tagData = new Map<string, number[]>();

    for (const rating of allRatings) {
      // Normalize score to 0.0 - 1.0 range
      const normalized = max === min ? 1.0 : (rating.score - min) / (max - min);

      for (const tag of rating.tags) {
        if (!tagData.has(tag)) {
          tagData.set(tag, []);
        }
        tagData.get(tag)!.push(normalized);
      }
    }

    // Calculate affinity per tag with dampening
    for (const [tag, scores] of tagData) {
      const count = scores.length;
      const average = scores.reduce((sum, s) => sum + s, 0) / count;

      // Apply dampening based on data point count
      let dampening: number;
      if (count === 1) {
        dampening = 0.7;
      } else if (count <= 3) {
        dampening = 0.85;
      } else {
        dampening = 1.0;
      }

      affinities.set(tag, average * dampening);
    }

    const profile: TagAffinityProfile = {
      userId,
      affinities,
      lastCalculated: new Date(),
    };

    await this.storage.setAffinityProfile(userId, profile);
    return profile;
  }

  async get(userId: string, candidates: CandidateTitle[]): Promise<Recommendation[]> {
    const profile = await this.getAffinityProfile(userId);

    // Get all rated titles to filter them out
    const allRatings = await this.storage.getAllRatings(userId);
    const ratedTitleIds = new Set(allRatings.map((r) => r.titleId));

    const recommendations: Recommendation[] = [];

    for (const candidate of candidates) {
      // Skip already-rated titles
      if (ratedTitleIds.has(candidate.titleId)) continue;

      const matchingTags: string[] = [];
      let totalScore = 0;

      for (const tag of candidate.tags) {
        const affinity = profile.affinities.get(tag);
        if (affinity !== undefined && affinity > 0) {
          totalScore += affinity;
          matchingTags.push(tag);
        }
      }

      // Normalize by number of candidate tags
      const score = candidate.tags.length > 0 ? totalScore / candidate.tags.length : 0;

      // Build reason from top 3 matching tags
      const topTags = matchingTags
        .sort((a, b) => (profile.affinities.get(b) ?? 0) - (profile.affinities.get(a) ?? 0))
        .slice(0, 3);

      const reason = topTags.length > 0
        ? `matches your top tags: ${topTags.join(', ')}`
        : '';

      recommendations.push({
        titleId: candidate.titleId,
        score,
        matchingTags,
        reason,
      });
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations;
  }
}
