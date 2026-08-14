/**
 * Standalone Fastify server — thin HTTP wrapper around Munin Core library.
 *
 * Auth model: expects verified userId in X-User-Id header.
 * Authentication happens upstream — Munin trusts the caller.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { createMunin } from './index.js';
import { createStorageFromEnv } from './config/storage-factory.js';
import { MuninError, NotFoundError } from './errors.js';
import {
  progressUpdateSchema,
  ratingSetSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  collectionAddItemSchema,
  contributionSubmitSchema,
  recommendationCandidatesSchema,
  importDataSchema,
} from './schemas.js';
import type { StorageBackend } from './storage/types.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

export interface BuildAppOptions {
  storage?: StorageBackend;
  logger?: boolean;
}

/**
 * Build a configured Fastify instance with all Munin routes and hooks.
 * Does NOT call listen — caller is responsible for starting the server.
 *
 * @example
 * ```typescript
 * const app = await buildApp({ storage: new InMemoryBackend() });
 * await app.listen({ port: 3000 });
 * ```
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const storage = options.storage ?? await createStorageFromEnv();
  const munin = createMunin({ storage });

  // --- Global error handler (TASK-094) ---

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof MuninError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
        statusCode: 400,
      });
    }

    // Unknown errors
    request.log.error(error);
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  // TODO: Auth middleware — extract userId from X-User-Id header
  app.addHook('preHandler', async (request, reply) => {
    const userId = request.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      return reply.code(401).send({ error: 'Missing X-User-Id header' });
    }
    // Attach userId to request for route handlers
    (request as unknown as { userId: string }).userId = userId;
  });

  // --- Progress routes ---

  app.post('/progress/:titleId', { schema: progressUpdateSchema }, async (request) => {
    const { titleId } = request.params as { titleId: string };
    const { userId } = request as unknown as { userId: string };
    const body = request.body as {
      currentSeconds: number;
      durationSeconds: number;
      type: 'movie' | 'episode';
      seriesId?: string;
      seasonId?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      deviceId?: string;
    };
    return munin.progress.update(userId, titleId, body);
  });

  app.get('/progress/:titleId', async (request) => {
    const { titleId } = request.params as { titleId: string };
    const { userId } = request as unknown as { userId: string };
    const result = await munin.progress.get(userId, titleId);
    if (!result) {
      throw new NotFoundError(`Progress not found for title ${titleId}`);
    }
    return result;
  });

  app.get('/progress', async (request) => {
    const { userId } = request as unknown as { userId: string };
    const query = request.query as { completed?: string; limit?: string; offset?: string };

    if (query.completed === 'false') {
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;
      return munin.progress.getInProgress(userId, { limit, offset });
    }

    const all = await munin.progress.getAll(userId);
    if (query.completed === 'true') {
      return all.filter((entry) => entry.isCompleted);
    }

    return all;
  });

  app.get('/series/:seriesId/progress', async (request) => {
    const { seriesId } = request.params as { seriesId: string };
    const { userId } = request as unknown as { userId: string };
    const result = await munin.progress.getSeries(userId, seriesId);
    if (!result) {
      throw new NotFoundError(`Series progress not found for series ${seriesId}`);
    }
    return result;
  });

  // --- Ratings routes ---

  app.post('/ratings/:titleId', { schema: ratingSetSchema }, async (request) => {
    const { titleId } = request.params as { titleId: string };
    const { userId } = request as unknown as { userId: string };
    const body = request.body as { score: number; tags: string[]; notes?: string };
    return munin.ratings.set(userId, titleId, { score: body.score, tags: body.tags, notes: body.notes });
  });

  app.get('/ratings/:titleId', async (request) => {
    const { titleId } = request.params as { titleId: string };
    const { userId } = request as unknown as { userId: string };
    const result = await munin.ratings.get(userId, titleId);
    if (!result) {
      throw new NotFoundError(`Rating not found for title ${titleId}`);
    }
    return result;
  });

  app.get('/ratings', async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.ratings.getAll(userId);
  });

  app.delete('/ratings/:titleId', async (request, reply) => {
    const { titleId } = request.params as { titleId: string };
    const { userId } = request as unknown as { userId: string };
    const deleted = await munin.ratings.delete(userId, titleId);
    if (!deleted) {
      throw new NotFoundError(`Rating not found for title ${titleId}`);
    }
    return reply.code(204).send();
  });

  // --- Recommendations routes ---

  app.post('/recommendations/candidates', { schema: recommendationCandidatesSchema }, async (request) => {
    const { userId } = request as unknown as { userId: string };
    const { candidates } = request.body as { candidates: Array<{ titleId: string; tags: string[] }> };
    return munin.recommendations.get(userId, candidates);
  });

  app.get('/recommendations', async (request) => {
    const { userId } = request as unknown as { userId: string };
    const profile = await munin.recommendations.getAffinityProfile(userId);
    return {
      ...profile,
      affinities: Object.fromEntries(profile.affinities),
    };
  });

  // --- Contributions routes ---

  app.post('/contributions', { schema: contributionSubmitSchema }, async (request, reply) => {
    const { userId } = request as unknown as { userId: string };
    const body = request.body as {
      title: string;
      type: 'movie' | 'series';
      tags: string[];
      year?: number;
      language?: string;
      region?: string;
      studio?: string;
      description?: string;
    };
    const result = await munin.contributions.submit(userId, body);
    return reply.code(201).send(result);
  });

  app.get('/contributions', async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.contributions.getAll(userId);
  });

  // --- Collections routes ---

  app.get('/collections', async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.collections.getAll(userId);
  });

  app.post('/collections', { schema: collectionCreateSchema }, async (request) => {
    const { userId } = request as unknown as { userId: string };
    const body = request.body as { name: string; type: 'manual' | 'smart'; items?: string[]; smartFilter?: object };
    return munin.collections.create(userId, body);
  });

  app.get('/collections/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { userId } = request as unknown as { userId: string };
    const result = await munin.collections.get(userId, id);
    if (!result) {
      throw new NotFoundError(`Collection '${id}' not found.`);
    }
    return result;
  });

  app.put('/collections/:id', { schema: collectionUpdateSchema }, async (request) => {
    const { id } = request.params as { id: string };
    const { userId } = request as unknown as { userId: string };
    const body = request.body as { name?: string; smartFilter?: object };
    return munin.collections.update(userId, id, body);
  });

  app.delete('/collections/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request as unknown as { userId: string };
    await munin.collections.delete(userId, id);
    return reply.code(204).send();
  });

  app.post('/collections/:id/items', { schema: collectionAddItemSchema }, async (request) => {
    const { id } = request.params as { id: string };
    const { userId } = request as unknown as { userId: string };
    const { titleId } = request.body as { titleId: string };
    return munin.collections.addItem(userId, id, titleId);
  });

  app.delete('/collections/:id/items/:titleId', async (request) => {
    const { id, titleId } = request.params as { id: string; titleId: string };
    const { userId } = request as unknown as { userId: string };
    return munin.collections.removeItem(userId, id, titleId);
  });

  // --- Export/Import routes ---

  app.post('/export', async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.export.exportAll(userId);
  });

  app.get('/export/resume', async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.export.resumePositions(userId);
  });

  app.post('/import', { schema: importDataSchema }, async (request) => {
    const { userId } = request as unknown as { userId: string };
    return munin.export.importData(userId, request.body as import('./types/contributions.js').ExportBundle);
  });

  // --- GDPR ---

  app.delete('/user-data', async (request, reply) => {
    const { userId } = request as unknown as { userId: string };
    await munin.deleteAllUserData(userId);
    return reply.code(204).send();
  });

  // --- Health check ---

  app.get('/health', async () => ({ status: 'ok', service: 'munin-core' }));

  return app;
}

async function main(): Promise<void> {
  const app = await buildApp({ logger: true });

  await app.listen({ port: PORT, host: HOST });
  console.log(`Munin server running on ${HOST}:${PORT}`);

  // Graceful shutdown
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only start the server when running directly (not when imported by tests)
const isDirectRun = process.argv[1]?.includes('server');

if (isDirectRun) {
  main().catch((err) => {
    console.error('Failed to start Munin server:', err);
    process.exit(1);
  });
}
