/**
 * Ratings & Tags — user-driven content rating and categorization.
 * Tag affinity recalculated on each new rating.
 */

import type { StorageBackend } from '../storage/types.js';
import type { UserRating, RatingInput } from '../types/ratings.js';
import type { MuninEventEmitter } from './events.js';
import type { RecommendationsEngine } from './recommendations.js';
import { ValidationError } from '../errors.js';

export interface RatingsModuleOptions {
  storage: StorageBackend;
  events: MuninEventEmitter;
  maxScore: number;
  minScore?: number;
}

export class RatingsModule {
  private storage: StorageBackend;
  private events: MuninEventEmitter;
  private maxScore: number;
  private minScore: number;
  private recommendations: RecommendationsEngine | null = null;

  constructor(options: RatingsModuleOptions) {
    this.storage = options.storage;
    this.events = options.events;
    this.maxScore = options.maxScore;
    this.minScore = options.minScore ?? 1;
  }

  /** Wire up recommendations engine (avoids circular constructor dependency) */
  setRecommendationsEngine(engine: RecommendationsEngine): void {
    this.recommendations = engine;
  }

  async set(userId: string, titleId: string, input: RatingInput): Promise<UserRating> {
    // Validate score range
    if (input.score < this.minScore || input.score > this.maxScore) {
      throw new ValidationError(
        `Score ${input.score} is out of range. Must be between ${this.minScore} and ${this.maxScore}.`,
      );
    }

    const rating: UserRating = {
      userId,
      titleId,
      score: input.score,
      tags: input.tags,
      notes: input.notes,
      ratedAt: new Date(),
    };

    await this.storage.setRating(rating);
    this.events.emit('rating.added', rating);

    // Recalculate tag affinity profile
    if (this.recommendations) {
      await this.recommendations.recalculateAffinity(userId);
    }

    return rating;
  }

  async get(userId: string, titleId: string): Promise<UserRating | null> {
    return this.storage.getRating(userId, titleId);
  }

  async getAll(userId: string): Promise<UserRating[]> {
    const ratings = await this.storage.getAllRatings(userId);
    // Sort by ratedAt descending (most recent first)
    return ratings.sort((a, b) => b.ratedAt.getTime() - a.ratedAt.getTime());
  }

  async delete(userId: string, titleId: string): Promise<boolean> {
    const existed = await this.storage.deleteRating(userId, titleId);

    if (existed && this.recommendations) {
      await this.recommendations.recalculateAffinity(userId);
    }

    return existed;
  }

  /** Get configured min/max scores for external use */
  getScoreRange(): { min: number; max: number } {
    return { min: this.minScore, max: this.maxScore };
  }
}
