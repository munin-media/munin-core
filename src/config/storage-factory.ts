/**
 * Storage backend factory — selects backend from environment variables.
 *
 * Supported backends:
 * - 'memory' (default) — ephemeral, for testing and development
 * - 'sqlite' — embedded single-file database (requires SQLITE_PATH)
 * - 'firestore' — cloud Firestore (requires GOOGLE_APPLICATION_CREDENTIALS)
 */

import type { StorageBackend } from '../storage/types.js';
import { InMemoryBackend } from '../storage/memory.js';

/**
 * Create a storage backend based on the STORAGE_BACKEND environment variable.
 *
 * Uses dynamic imports for sqlite and firestore backends so their heavy
 * dependencies are not loaded unless explicitly selected.
 *
 * @returns A configured StorageBackend instance
 * @throws If STORAGE_BACKEND is set to an unrecognized value
 */
export async function createStorageFromEnv(): Promise<StorageBackend> {
  const backend = process.env['STORAGE_BACKEND'] ?? 'memory';

  switch (backend) {
    case 'sqlite': {
      const { SQLiteBackend } = await import('../storage/sqlite.js');
      const dbPath = process.env['SQLITE_PATH'] ?? './munin.db';
      return new SQLiteBackend(dbPath);
    }
    case 'firestore': {
      const { FirestoreBackend } = await import('../storage/firestore.js');
      return new FirestoreBackend();
    }
    case 'memory':
      return new InMemoryBackend();
    default:
      throw new Error(
        `Unknown STORAGE_BACKEND: '${backend}'. Supported values: memory, sqlite, firestore`
      );
  }
}
