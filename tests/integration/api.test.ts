/**
 * HTTP Integration Tests for Munin Core API.
 *
 * Uses Fastify's app.inject() for full HTTP layer testing without network calls.
 * Each describe block gets a fresh app instance with InMemoryBackend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server.js';
import { InMemoryBackend } from '../../src/storage/memory.js';

const USER_ID = 'test-user-1';

function headers(userId = USER_ID) {
  return { 'x-user-id': userId, 'content-type': 'application/json' };
}

function authHeaders(userId = USER_ID) {
  return { 'x-user-id': userId };
}

describe('HTTP Integration Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ storage: new InMemoryBackend(), logger: false });
  });

  // --- Auth ---

  describe('Auth', () => {
    it('returns 401 when X-User-Id header is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/progress',
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toBe('Missing X-User-Id header');
    });

    it('returns 200 when X-User-Id header is present', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/progress',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // --- Progress routes ---

  describe('Progress', () => {
    it('POST /progress/:titleId with valid body returns 200 + ProgressEntry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: {
          currentSeconds: 1800,
          durationSeconds: 3600,
          type: 'movie',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.titleId).toBe('movie-1');
      expect(body.userId).toBe(USER_ID);
      expect(body.currentSeconds).toBe(1800);
      expect(body.durationSeconds).toBe(3600);
      expect(body.type).toBe('movie');
      expect(body.isCompleted).toBe(false);
    });

    it('POST /progress/:titleId with invalid body (missing type) returns 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: {
          currentSeconds: 1800,
          durationSeconds: 3600,
          // missing 'type'
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('GET /progress/:titleId returns 200 when exists', async () => {
      // First create progress
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 900, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/progress/movie-1',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.titleId).toBe('movie-1');
      expect(body.currentSeconds).toBe(900);
    });

    it('GET /progress/:titleId returns 404 when not exists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/progress/nonexistent',
        headers: headers(),
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe('NOT_FOUND');
    });

    it('GET /progress?completed=false returns only in-progress entries', async () => {
      // Create one completed and one in-progress
      await app.inject({
        method: 'POST',
        url: '/progress/movie-done',
        headers: headers(),
        payload: { currentSeconds: 3500, durationSeconds: 3600, type: 'movie' },
      });
      await app.inject({
        method: 'POST',
        url: '/progress/movie-partial',
        headers: headers(),
        payload: { currentSeconds: 100, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/progress?completed=false',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      // Only the in-progress one should appear
      const titleIds = body.map((e: { titleId: string }) => e.titleId);
      expect(titleIds).toContain('movie-partial');
      expect(titleIds).not.toContain('movie-done');
    });
  });

  // --- Ratings routes ---

  describe('Ratings', () => {
    it('POST /ratings/:titleId with valid body returns 200', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 8, tags: ['action', 'sci-fi'] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.titleId).toBe('movie-1');
      expect(body.score).toBe(8);
      expect(body.tags).toEqual(['action', 'sci-fi']);
    });

    it('POST /ratings/:titleId with score=0 (out of range) returns 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 0, tags: ['drama'] },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('GET /ratings/:titleId returns 200 when exists', async () => {
      await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 7, tags: ['comedy'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/ratings/movie-1',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.titleId).toBe('movie-1');
      expect(body.score).toBe(7);
    });

    it('GET /ratings/:titleId returns 404 when not exists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/ratings/nonexistent',
        headers: headers(),
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe('NOT_FOUND');
    });

    it('DELETE /ratings/:titleId returns 204', async () => {
      // First create
      await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 5, tags: ['horror'] },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/ratings/movie-1',
        headers: headers(),
      });
      expect(res.statusCode).toBe(204);
    });
  });

  // --- Collections routes ---

  describe('Collections', () => {
    it('POST /collections returns 200 with collection', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'Favorites', type: 'manual' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Favorites');
      expect(body.type).toBe('manual');
      expect(body.collectionId).toBeDefined();
    });

    it('POST /collections missing name returns 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { type: 'manual' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('GET /collections returns 200 + array', async () => {
      // Create two collections
      await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'Watchlist', type: 'manual' },
      });
      await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'Top Picks', type: 'manual' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/collections',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    it('POST /collections/:id/items returns 200 with updated collection', async () => {
      // Create a collection
      const createRes = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'My List', type: 'manual' },
      });
      const { collectionId } = createRes.json();

      // Add item
      const res = await app.inject({
        method: 'POST',
        url: `/collections/${collectionId}/items`,
        headers: headers(),
        payload: { titleId: 'movie-abc' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toContain('movie-abc');
    });

    it('DELETE /collections/:id/items/:titleId returns 200', async () => {
      // Create a collection and add an item
      const createRes = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'Remove Test', type: 'manual' },
      });
      const { collectionId } = createRes.json();

      await app.inject({
        method: 'POST',
        url: `/collections/${collectionId}/items`,
        headers: headers(),
        payload: { titleId: 'movie-xyz' },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/collections/${collectionId}/items/movie-xyz`,
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).not.toContain('movie-xyz');
    });

    it('DELETE /collections/:id returns 204', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: headers(),
        payload: { name: 'To Delete', type: 'manual' },
      });
      const { collectionId } = createRes.json();

      const res = await app.inject({
        method: 'DELETE',
        url: `/collections/${collectionId}`,
        headers: headers(),
      });
      expect(res.statusCode).toBe(204);
    });
  });

  // --- Recommendations routes ---

  describe('Recommendations', () => {
    it('POST /recommendations/candidates returns 200 + scored array', async () => {
      // First create some ratings to build affinity profile
      await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 9, tags: ['action', 'thriller'] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/recommendations/candidates',
        headers: headers(),
        payload: {
          candidates: [
            { titleId: 'movie-2', tags: ['action', 'comedy'] },
            { titleId: 'movie-3', tags: ['romance', 'drama'] },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      // Each item should have a score
      for (const item of body) {
        expect(item).toHaveProperty('titleId');
        expect(item).toHaveProperty('score');
        expect(typeof item.score).toBe('number');
      }
    });

    it('GET /recommendations returns 200 + affinity profile with affinities as object', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/recommendations',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('affinities');
      // Must be a plain object, not serialized as Map
      expect(typeof body.affinities).toBe('object');
      expect(body.affinities).not.toBeNull();
      expect(Array.isArray(body.affinities)).toBe(false);
    });
  });

  // --- Contributions routes ---

  describe('Contributions', () => {
    it('POST /contributions with valid body returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/contributions',
        headers: headers(),
        payload: {
          title: 'Indie Film',
          type: 'movie',
          tags: ['indie', 'drama'],
          year: 2024,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('contributionId');
      expect(body).toHaveProperty('titleId');
      expect(body.status).toBeDefined();
    });

    it('GET /contributions returns 200 + array', async () => {
      // Submit one first
      await app.inject({
        method: 'POST',
        url: '/contributions',
        headers: headers(),
        payload: { title: 'Test Movie', type: 'movie', tags: ['test'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/contributions',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Export/Import routes ---

  describe('Export/Import', () => {
    it('POST /export returns 200 + bundle with exportedAt field', async () => {
      // Create some data first
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 500, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/export',
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('progress');
      expect(body).toHaveProperty('ratings');
      expect(Array.isArray(body.progress)).toBe(true);
    });

    it('GET /export/resume returns 200 + items array', async () => {
      // Create progress data
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 1200, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/export/resume',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('POST /import with valid bundle returns 200 + summary', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/import',
        headers: headers(),
        payload: {
          version: 1,
          exportedAt: new Date().toISOString(),
          userId: USER_ID,
          data: {
            progress: [],
            ratings: [],
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('imported');
      expect(body).toHaveProperty('skipped');
    });
  });

  // --- GDPR ---

  describe('GDPR', () => {
    it('DELETE /user-data returns 204', async () => {
      // Create some data first
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 500, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/user-data',
        headers: headers(),
      });
      expect(res.statusCode).toBe(204);
    });

    it('after deletion, GET /progress returns empty', async () => {
      // Create data
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 500, durationSeconds: 3600, type: 'movie' },
      });

      // Delete all user data
      await app.inject({
        method: 'DELETE',
        url: '/user-data',
        headers: headers(),
      });

      // Verify empty
      const res = await app.inject({
        method: 'GET',
        url: '/progress',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual([]);
    });
  });

  // --- Serialization ---

  describe('Serialization', () => {
    it('dates in response are ISO strings (not [object Object])', async () => {
      await app.inject({
        method: 'POST',
        url: '/progress/movie-1',
        headers: headers(),
        payload: { currentSeconds: 600, durationSeconds: 3600, type: 'movie' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/progress/movie-1',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // lastUpdated should be an ISO date string
      expect(typeof body.lastUpdated).toBe('string');
      expect(body.lastUpdated).not.toBe('[object Object]');
      // Verify it parses as a valid date
      const date = new Date(body.lastUpdated);
      expect(date.getTime()).not.toBeNaN();
    });

    it('affinity profile Map serialized as plain object', async () => {
      // Create a rating so the affinity profile has some data
      await app.inject({
        method: 'POST',
        url: '/ratings/movie-1',
        headers: headers(),
        payload: { score: 8, tags: ['action', 'sci-fi'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/recommendations',
        headers: headers(),
      });
      expect(res.statusCode).toBe(200);
      const raw = res.body;
      // Should NOT contain Map-like serialization artifacts
      expect(raw).not.toContain('[object Map]');
      expect(raw).not.toContain('[object Object]');

      const body = res.json();
      expect(typeof body.affinities).toBe('object');
      // Verify it's a plain JSON object with string keys
      if (Object.keys(body.affinities).length > 0) {
        const firstKey = Object.keys(body.affinities)[0];
        expect(typeof firstKey).toBe('string');
        expect(typeof body.affinities[firstKey]).toBe('number');
      }
    });
  });
});
