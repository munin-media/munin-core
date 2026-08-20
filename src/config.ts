/**
 * @munin-media/core/config — Storage factory sub-path entry.
 *
 * Node-only: uses process.env and may dynamically import sqlite/firestore backends.
 * Do NOT import this from React Native / Metro bundles.
 *
 * @example
 * ```typescript
 * import { createStorageFromEnv } from '@munin-media/core/config';
 * const storage = await createStorageFromEnv();
 * ```
 */

export { createStorageFromEnv } from './config/storage-factory.js';
