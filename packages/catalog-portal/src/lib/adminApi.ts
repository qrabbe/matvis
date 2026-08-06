import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import type { GenericId } from 'convex/values';

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

export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
};

export type FreshnessStats = {
  neverFetched: number;
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

export const adminApi = anyApi as unknown as AdminApi;
