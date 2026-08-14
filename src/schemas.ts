/**
 * JSON Schema definitions for Fastify route validation.
 * Fastify auto-returns 400 with validation details when schema doesn't match.
 */

export const progressUpdateSchema = {
  body: {
    type: 'object',
    required: ['currentSeconds', 'durationSeconds', 'type'],
    properties: {
      currentSeconds: { type: 'number', minimum: 0 },
      durationSeconds: { type: 'number', exclusiveMinimum: 0 },
      type: { type: 'string', enum: ['movie', 'episode'] },
      seriesId: { type: 'string' },
      seasonId: { type: 'string' },
      seasonNumber: { type: 'number', minimum: 1 },
      episodeNumber: { type: 'number', minimum: 1 },
      deviceId: { type: 'string' },
    },
  },
} as const;

export const ratingSetSchema = {
  body: {
    type: 'object',
    required: ['score', 'tags'],
    properties: {
      score: { type: 'number', minimum: 1, maximum: 10 },
      tags: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
  },
} as const;

export const collectionCreateSchema = {
  body: {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['manual', 'smart'] },
      items: { type: 'array', items: { type: 'string' } },
      smartFilter: { type: 'object' },
    },
  },
} as const;

export const collectionUpdateSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      smartFilter: { type: 'object' },
    },
  },
} as const;

export const collectionAddItemSchema = {
  body: {
    type: 'object',
    required: ['titleId'],
    properties: {
      titleId: { type: 'string', minLength: 1 },
    },
  },
} as const;

export const contributionSubmitSchema = {
  body: {
    type: 'object',
    required: ['title', 'type', 'tags'],
    properties: {
      title: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['movie', 'series'] },
      tags: { type: 'array', items: { type: 'string' } },
      year: { type: 'number', minimum: 1800, maximum: 2100 },
      language: { type: 'string' },
      region: { type: 'string' },
      studio: { type: 'string' },
      description: { type: 'string' },
    },
  },
} as const;

export const recommendationCandidatesSchema = {
  body: {
    type: 'object',
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: ['titleId', 'tags'],
          properties: {
            titleId: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
} as const;

export const importDataSchema = {
  body: {
    type: 'object',
    required: ['version', 'data'],
    properties: {
      version: { type: 'number' },
      exportedAt: { type: 'string' },
      userId: { type: 'string' },
      data: { type: 'object' },
    },
  },
} as const;
