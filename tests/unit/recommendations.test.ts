import { describe, it, expect, beforeEach } from 'vitest';
import { RatingsModule } from '../../src/core/ratings.js';
import { RecommendationsEngine } from '../../src/core/recommendations.js';
import { MuninEventEmitter } from '../../src/core/events.js';
import { InMemoryBackend } from '../../src/storage/memory.js';
import type { CandidateTitle } from '../../src/types/ratings.js';

describe('RecommendationsEngine', () => {
  let storage: InMemoryBackend;
  let events: MuninEventEmitter;
  let ratings: RatingsModule;
  let recommendations: RecommendationsEngine;

  beforeEach(() => {
    storage = new InMemoryBackend();
    events = new MuninEventEmitter();
    ratings = new RatingsModule({
      storage,
      events,
      maxScore: 10,
    });
    recommendations = new RecommendationsEngine({
      storage,
      ratings,
    });
    ratings.setRecommendationsEngine(recommendations);
  });

  describe('getAffinityProfile()', () => {
    it('returns empty profile for user with no ratings', async () => {
      const profile = await recommendations.getAffinityProfile('user-1');

      expect(profile.userId).toBe('user-1');
      expect(profile.affinities.size).toBe(0);
      expect(profile.lastCalculated).toBeInstanceOf(Date);
    });

    it('calculates affinity from a single rating', async () => {
      await ratings.set('user-1', 'title-1', {
        score: 8,
        tags: ['sci-fi', 'action'],
      });

      const profile = await recommendations.getAffinityProfile('user-1');

      // score 8, range 1-10, normalized = (8-1)/(10-1) = 7/9 ≈ 0.778
      // Single data point → dampening 0.7
      const expectedAffinity = (7 / 9) * 0.7;

      expect(profile.affinities.get('sci-fi')).toBeCloseTo(expectedAffinity, 4);
      expect(profile.affinities.get('action')).toBeCloseTo(expectedAffinity, 4);
    });

    it('calculates affinity from multiple ratings (weighted average)', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-2', { score: 8, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-3', { score: 4, tags: ['sci-fi'] });

      const profile = await recommendations.getAffinityProfile('user-1');

      // Normalized scores: (10-1)/9 = 1.0, (8-1)/9 = 7/9, (4-1)/9 = 3/9
      // Average: (1.0 + 7/9 + 3/9) / 3 = (9/9 + 7/9 + 3/9) / 3 = (19/9) / 3 = 19/27
      // 3 data points → dampening 0.85
      const expectedAffinity = (19 / 27) * 0.85;

      expect(profile.affinities.get('sci-fi')).toBeCloseTo(expectedAffinity, 4);
    });

    it('applies dampening of 0.7 for tags with 1 data point', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['rare-tag'] });

      const profile = await recommendations.getAffinityProfile('user-1');

      // Normalized: (10-1)/9 = 1.0
      // Dampening: 0.7 (single data point)
      expect(profile.affinities.get('rare-tag')).toBeCloseTo(1.0 * 0.7, 4);
    });

    it('applies dampening of 0.85 for tags with 2-3 data points', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['mid-tag'] });
      await ratings.set('user-1', 'title-2', { score: 10, tags: ['mid-tag'] });

      const profile = await recommendations.getAffinityProfile('user-1');

      // Both normalized to 1.0, average = 1.0
      // Dampening: 0.85 (2 data points)
      expect(profile.affinities.get('mid-tag')).toBeCloseTo(1.0 * 0.85, 4);
    });

    it('applies no dampening (1.0) for tags with 4+ data points', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['popular'] });
      await ratings.set('user-1', 'title-2', { score: 10, tags: ['popular'] });
      await ratings.set('user-1', 'title-3', { score: 10, tags: ['popular'] });
      await ratings.set('user-1', 'title-4', { score: 10, tags: ['popular'] });

      const profile = await recommendations.getAffinityProfile('user-1');

      // All normalized to 1.0, average = 1.0
      // Dampening: 1.0 (4+ data points)
      expect(profile.affinities.get('popular')).toBeCloseTo(1.0, 4);
    });

    it('handles mixed dampening across different tags', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi', 'action'] });
      await ratings.set('user-1', 'title-2', { score: 8, tags: ['sci-fi', 'thriller'] });
      await ratings.set('user-1', 'title-3', { score: 6, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-4', { score: 9, tags: ['sci-fi'] });

      const profile = await recommendations.getAffinityProfile('user-1');

      // sci-fi: 4 data points → no dampening
      // action: 1 data point → 0.7
      // thriller: 1 data point → 0.7
      expect(profile.affinities.has('sci-fi')).toBe(true);
      expect(profile.affinities.has('action')).toBe(true);
      expect(profile.affinities.has('thriller')).toBe(true);

      // action only has score 10 → normalized 1.0 → dampened 0.7
      expect(profile.affinities.get('action')).toBeCloseTo(1.0 * 0.7, 4);
    });
  });

  describe('get() — recommendations', () => {
    it('scores candidates correctly', async () => {
      // Set up ratings to establish affinity
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-2', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-3', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-4', { score: 10, tags: ['sci-fi'] });
      // sci-fi: 4 data points, all 10 → affinity = 1.0 * 1.0 = 1.0

      const candidates: CandidateTitle[] = [
        { titleId: 'candidate-1', tags: ['sci-fi'] },
        { titleId: 'candidate-2', tags: ['drama'] },
      ];

      const recs = await recommendations.get('user-1', candidates);

      // candidate-1 should score high (sci-fi affinity = 1.0)
      const rec1 = recs.find((r) => r.titleId === 'candidate-1');
      expect(rec1).toBeDefined();
      expect(rec1!.score).toBeCloseTo(1.0, 4);

      // candidate-2 has no matching tags (drama not in profile)
      const rec2 = recs.find((r) => r.titleId === 'candidate-2');
      expect(rec2).toBeDefined();
      expect(rec2!.score).toBe(0);
    });

    it('filters out already-rated titles', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });

      const candidates: CandidateTitle[] = [
        { titleId: 'title-1', tags: ['sci-fi'] }, // Already rated
        { titleId: 'new-title', tags: ['sci-fi'] },
      ];

      const recs = await recommendations.get('user-1', candidates);

      const ratedTitle = recs.find((r) => r.titleId === 'title-1');
      expect(ratedTitle).toBeUndefined();

      const newTitle = recs.find((r) => r.titleId === 'new-title');
      expect(newTitle).toBeDefined();
    });

    it('sorts recommendations by score descending', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-2', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-3', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-4', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-5', { score: 3, tags: ['drama'] });

      const candidates: CandidateTitle[] = [
        { titleId: 'c-drama', tags: ['drama'] },
        { titleId: 'c-scifi', tags: ['sci-fi'] },
        { titleId: 'c-mixed', tags: ['sci-fi', 'drama'] },
      ];

      const recs = await recommendations.get('user-1', candidates);

      // Verify descending order
      for (let i = 0; i < recs.length - 1; i++) {
        expect(recs[i].score).toBeGreaterThanOrEqual(recs[i + 1].score);
      }
    });

    it('populates matchingTags correctly', async () => {
      await ratings.set('user-1', 'title-1', { score: 8, tags: ['sci-fi', 'action'] });

      const candidates: CandidateTitle[] = [
        { titleId: 'candidate-1', tags: ['sci-fi', 'romance', 'action'] },
      ];

      const recs = await recommendations.get('user-1', candidates);
      const rec = recs.find((r) => r.titleId === 'candidate-1');

      expect(rec).toBeDefined();
      expect(rec!.matchingTags).toContain('sci-fi');
      expect(rec!.matchingTags).toContain('action');
      expect(rec!.matchingTags).not.toContain('romance');
    });

    it('formats reason string correctly', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi', 'thriller', 'space-opera', 'epic'] });

      const candidates: CandidateTitle[] = [
        { titleId: 'candidate-1', tags: ['sci-fi', 'thriller', 'space-opera', 'epic'] },
      ];

      const recs = await recommendations.get('user-1', candidates);
      const rec = recs.find((r) => r.titleId === 'candidate-1');

      expect(rec).toBeDefined();
      // Reason should contain "matches your top tags:" and at most 3 tags
      expect(rec!.reason).toMatch(/^matches your top tags: /);
      const tagsInReason = rec!.reason.replace('matches your top tags: ', '').split(', ');
      expect(tagsInReason.length).toBeLessThanOrEqual(3);
    });

    it('returns empty recommendations for empty candidates', async () => {
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });

      const recs = await recommendations.get('user-1', []);
      expect(recs).toEqual([]);
    });

    it('user with no ratings gets zero scores', async () => {
      const candidates: CandidateTitle[] = [
        { titleId: 'candidate-1', tags: ['sci-fi'] },
        { titleId: 'candidate-2', tags: ['drama'] },
      ];

      const recs = await recommendations.get('user-1', candidates);

      for (const rec of recs) {
        expect(rec.score).toBe(0);
      }
    });

    it('normalizes score by candidate tag count', async () => {
      // Build solid affinity for 'sci-fi' only
      await ratings.set('user-1', 'title-1', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-2', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-3', { score: 10, tags: ['sci-fi'] });
      await ratings.set('user-1', 'title-4', { score: 10, tags: ['sci-fi'] });

      const candidates: CandidateTitle[] = [
        { titleId: 'pure-scifi', tags: ['sci-fi'] },
        { titleId: 'diluted', tags: ['sci-fi', 'unknown1', 'unknown2', 'unknown3'] },
      ];

      const recs = await recommendations.get('user-1', candidates);
      const pureScifi = recs.find((r) => r.titleId === 'pure-scifi');
      const diluted = recs.find((r) => r.titleId === 'diluted');

      // Pure sci-fi candidate should score higher because score is divided by tag count
      expect(pureScifi!.score).toBeGreaterThan(diluted!.score);
    });
  });
});
