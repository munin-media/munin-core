/**
 * @munin/core/firestore — Firestore storage backend sub-path entry.
 *
 * Node-only: requires firebase-admin (server SDK).
 * Do NOT import this from React Native / Metro bundles.
 *
 * @example
 * ```typescript
 * import { FirestoreBackend } from '@munin/core/firestore';
 * const storage = new FirestoreBackend();
 * ```
 */

export { FirestoreBackend } from './storage/firestore.js';
