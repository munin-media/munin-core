# @munin/core

Zero-knowledge media memory service — progress tracking, ratings, recommendations, and export.

Munin remembers what you've watched without ever knowing what it is. It operates on opaque identifiers, tracking progress and preferences while remaining completely content-agnostic.

## Quick Start

```bash
yarn install
yarn build
yarn start   # Standalone Fastify server
```

## Library Usage

```typescript
import { createMunin, InMemoryBackend } from '@munin/core';

const munin = createMunin({
  storage: new InMemoryBackend(),
  completionThreshold: 0.9,
  conflictResolution: 'latest-wins',
});

// Track progress
await munin.progress.update('user-1', 'title-abc', {
  currentSeconds: 2580,
  durationSeconds: 3540,
});

// Rate content
await munin.ratings.set('user-1', 'title-abc', {
  score: 8,
  tags: ['sci-fi', 'space'],
});

// Get recommendations
const recs = await munin.recommendations.get('user-1', [
  { titleId: 'title-xyz', tags: ['sci-fi', 'thriller'] },
]);

// Export resume positions
const resume = await munin.export.resumePositions('user-1');

// Subscribe to events
munin.on('episode.completed', (entry) => {
  console.log(`Completed: ${entry.titleId}`);
});
```

## Standalone Server

The server wraps the library with REST endpoints. Auth is delegated — pass `X-User-Id` header.

```bash
PORT=3000 yarn start
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/progress/:titleId` | Update progress |
| GET | `/progress/:titleId` | Get progress |
| GET | `/progress` | Get all progress (filter: `?completed=false&limit=20&offset=0`) |
| GET | `/series/:seriesId/progress` | Series progress |
| POST | `/ratings/:titleId` | Rate a title |
| GET | `/ratings/:titleId` | Get rating |
| GET | `/ratings` | Get all ratings |
| DELETE | `/ratings/:titleId` | Delete a rating |
| POST | `/recommendations/candidates` | Get scored recommendations |
| GET | `/recommendations` | Get tag affinity profile |
| GET | `/collections` | List collections |
| POST | `/collections` | Create collection |
| GET | `/collections/:id` | Get collection |
| PUT | `/collections/:id` | Update collection |
| DELETE | `/collections/:id` | Delete collection |
| POST | `/collections/:id/items` | Add item to collection |
| DELETE | `/collections/:id/items/:titleId` | Remove item from collection |
| POST | `/contributions` | Submit niche content |
| GET | `/contributions` | List contributions |
| POST | `/export` | Export all user data |
| GET | `/export/resume` | Export resume positions |
| POST | `/import` | Import user data |
| DELETE | `/user-data` | Delete all user data (GDPR) |
| GET | `/health` | Health check |

### Authentication

All routes require an `X-User-Id` header. Authentication happens upstream — Munin trusts the caller to have verified the user.

```bash
curl -H "X-User-Id: user-123" http://localhost:3000/progress
```

Missing header returns `401`.

### Error Responses

All errors follow a consistent format:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Score must be between 1 and 10",
  "statusCode": 400
}
```

| Code | Error | When |
|------|-------|------|
| 400 | `VALIDATION_ERROR` | Invalid request body or parameters |
| 401 | Unauthorized | Missing X-User-Id header |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Invalid operation (e.g., addItem on smart collection) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

Request bodies are validated with JSON Schema — invalid payloads are rejected before reaching core logic.

## Storage Backends

| Backend | Use Case |
|---------|----------|
| `InMemoryBackend` | Testing, development |
| `SQLiteBackend` | Embedded/local apps |
| `FirestoreBackend` | Cloud deployments |

### Environment Variables

The standalone server selects its storage backend via environment variables:

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `STORAGE_BACKEND` | `memory`, `sqlite`, `firestore` | `memory` | Storage engine to use |
| `SQLITE_PATH` | File path | `./munin.db` | Path to SQLite database file (when backend is `sqlite`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | File path | — | Path to Firestore service account JSON (when backend is `firestore`) |
| `PORT` | Number | `3000` | Server port |
| `HOST` | Hostname/IP | `0.0.0.0` | Server bind address |

```bash
# Examples
STORAGE_BACKEND=memory PORT=3000 yarn start     # In-memory (default)
STORAGE_BACKEND=sqlite SQLITE_PATH=./data.db yarn start   # SQLite
STORAGE_BACKEND=firestore yarn start             # Firestore (needs credentials)
```

Library consumers can also use env-based selection:

```typescript
import { createMunin, createStorageFromEnv } from '@munin/core';

const storage = await createStorageFromEnv(); // reads STORAGE_BACKEND
const munin = createMunin({ storage });
```

## Development

```bash
yarn dev       # Watch mode (TypeScript compiler)
yarn test      # Run tests (Vitest)
yarn lint      # Type check without emitting
yarn build     # Compile to dist/
```

## Architecture

- **Zero-knowledge**: Operates on opaque IDs only. Never sees content URLs or titles.
- **Library-first**: Core logic is the npm package. Server is a thin wrapper.
- **Adapter pattern**: Metadata sources are pluggable via `MediaDatabaseAdapter` interface.
- **Event-driven**: Emits lifecycle events for consuming apps to hook into.
- **GDPR-ready**: Complete user data deletion on demand.
- **Multi-device**: Conflict resolution for cross-device progress sync.

## Project Status

| Module | Status |
|--------|--------|
| Progress Tracker | ✅ Complete |
| Ratings & Tag Affinity | ✅ Complete |
| Recommendations Engine | ✅ Complete |
| Collections (manual + smart) | ✅ Complete |
| Export/Import | ✅ Complete |
| Contributions Pipeline | ✅ Complete |
| GDPR Deletion | ✅ Complete |
| Media DB Adapters | ✅ Complete |
| Multi-device Sync | ✅ Complete |
| Standalone API | ✅ Complete |
| Request Validation | ✅ Complete |
| Error Handling | ✅ Complete |

**Tests**: 188 (159 unit + 29 integration)

## Tech Stack

- Node.js 20.x LTS
- TypeScript 5.x (strict mode)
- Fastify (standalone server)
- Cloud Firestore / SQLite / In-memory storage
- Vitest for testing
- Yarn 4 (Berry)
