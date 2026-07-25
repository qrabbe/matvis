import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import type { GenericId } from 'convex/values';

// ── Typed facade over the catalog's admin Convex API ─────────────────────────
// Same arrangement as `convexApi.ts` and for the same reason: the portal is a
// separate package from @matvis/catalog, so it reaches the deployment through
// Convex's runtime `anyApi` proxy and layers static types on top rather than
// importing the generated `api` and dragging the whole convex/ program into this
// package's typecheck.
//
// Every function here except `signIn` takes a `token`, because the backend
// defines them through a wrapper that adds it (see convex/admin.ts). Reads
// return null when the token is bad, which is exactly how the console knows it
// is signed out. Writes throw.
//
// Nothing in this bundle is a secret. The gate is entirely server side, so
// shipping the admin console inside the public portal bundle gives away only the
// names of functions that refuse to answer without a session.

export type QueueStatus =
  'pending' | 'processing' | 'done' | 'skipped' | 'failed';

export type QueueRow = {
  _id: GenericId<'coop_ingest_queue'>;
  _creationTime: number;
  kind: 'ean' | 'name';
  ean?: string;
  query?: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  source: string;
  enqueuedAt: number;
  processedAt?: number;
};

export type RunRow = {
  _id: GenericId<'ingest_runs'>;
  _creationTime: number;
  kind: 'discovery' | 'drain' | 'refresh';
  status: 'running' | 'ok' | 'paused' | 'error';
  startedAt: number;
  finishedAt?: number;
  summary?: Record<string, number>;
  error?: string;
};

/** Counts stop at a ceiling per status. `capped` means at least one of them did,
 * so render those as "1000+". */
export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
  capped: boolean;
};

export type FreshnessStats = {
  neverFetched: number;
  neverFetchedCapped: boolean;
  oldestFetchedAt: number | null;
};

export type Overview = {
  catalogTotal: number;
  paused: boolean;
  queue: QueueStats;
  freshness: FreshnessStats;
};

type Token = { token: string };

type AdminApi = {
  admin: {
    signIn: FunctionReference<
      'action',
      'public',
      { password: string },
      { token: string; expiresAt: number }
    >;
    signOutEverywhere: FunctionReference<
      'mutation',
      'public',
      Token,
      { revoked: number; isDone: boolean }
    >;
    overview: FunctionReference<'query', 'public', Token, Overview | null>;
    runs: FunctionReference<'query', 'public', Token, RunRow[] | null>;
    queueRows: FunctionReference<
      'query',
      'public',
      Token & { status: QueueStatus; cursor?: string | null },
      { rows: QueueRow[]; continueCursor: string; isDone: boolean } | null
    >;
    startDiscovery: FunctionReference<
      'mutation',
      'public',
      Token & { drain?: boolean },
      null
    >;
    startDrain: FunctionReference<
      'mutation',
      'public',
      Token & { batches?: number },
      { batches: number }
    >;
    startRefresh: FunctionReference<
      'mutation',
      'public',
      Token & { batches?: number },
      { batches: number }
    >;
    setPaused: FunctionReference<
      'mutation',
      'public',
      Token & { paused: boolean },
      null
    >;
    requeueFailed: FunctionReference<
      'action',
      'public',
      Token & { limit?: number },
      { requeued: number }
    >;
    clearDoneRows: FunctionReference<
      'action',
      'public',
      Token & { limit?: number },
      { deleted: number }
    >;
    removeQueueRows: FunctionReference<
      'action',
      'public',
      Token & { ean?: string; query?: string },
      { deleted: number }
    >;
    enqueueEans: FunctionReference<
      'action',
      'public',
      Token & { eans: string[] },
      { queued: number; known: number; duplicate: number }
    >;
    enqueueName: FunctionReference<
      'action',
      'public',
      Token & { query: string },
      { status: 'queued' | 'duplicate' }
    >;
  };
};

/** The catalog's admin API, statically typed, backed by the runtime proxy. */
export const adminApi = anyApi as unknown as AdminApi;
