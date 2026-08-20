/**
 * @munin-media/core/sqlite — SQLite storage backend sub-path entry.
 *
 * Node-only: requires better-sqlite3 (C++ native module).
 * Do NOT import this from React Native / Metro bundles.
 *
 * @example
 * ```typescript
 * import { SQLiteBackend } from '@munin-media/core/sqlite';
 * const storage = new SQLiteBackend('./munin.db');
 * ```
 */

export { SQLiteBackend } from './storage/sqlite.js';
