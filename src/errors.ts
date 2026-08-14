/**
 * Custom error classes for Munin Core.
 * Used by core modules and the Fastify error handler for consistent error responses.
 */

export class MuninError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MuninError';
  }
}

export class ValidationError extends MuninError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class NotFoundError extends MuninError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends MuninError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
