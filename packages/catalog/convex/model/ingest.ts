import { v } from 'convex/values';

export const queueKindValidator = v.union(v.literal('ean'), v.literal('name'));

export const queueStatusValidator = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('done'),
  v.literal('skipped'),
  v.literal('failed'),
);

export type QueueKind = 'ean' | 'name';
export type QueueStatus =
  'pending' | 'processing' | 'done' | 'skipped' | 'failed';

export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending',
  'processing',
  'done',
  'skipped',
  'failed',
];

export const COOP_BATCH_SIZE = 500;

export const DEFAULT_QUEUE_BATCHES = 4;

export const REFRESH_BATCH_SIZE = 250;

export const DEFAULT_REFRESH_BATCHES = 8;

export const STALE_CLAIM_MS = 30 * 60 * 1000;

export const SEARCH_HITS_PER_NAME = 10;

export const ENQUEUE_CHUNK = 200;

export const DISCOVERY_DRAIN_MAX_BATCHES = 30;

export const QUEUE_DEDUP_SCAN = 8;

export const QUEUE_MAINTENANCE_LIMIT = 1000;

export const MAX_ERROR_LENGTH = 500;

export const queueRowValidator = v.object({
  _id: v.id('coop_ingest_queue'),
  _creationTime: v.number(),
  kind: queueKindValidator,
  ean: v.optional(v.string()),
  query: v.optional(v.string()),
  status: queueStatusValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  source: v.string(),
  enqueuedAt: v.number(),
  processedAt: v.optional(v.number()),
});

export const queueStatsValidator = v.object({
  pending: v.number(),
  processing: v.number(),
  done: v.number(),
  skipped: v.number(),
  failed: v.number(),
});

export const freshnessStatsValidator = v.object({
  neverFetched: v.number(),
  oldestFetchedAt: v.union(v.number(), v.null()),
});

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export const runKindValidator = v.union(
  v.literal('discovery'),
  v.literal('drain'),
  v.literal('refresh'),
);

export const runStatusValidator = v.union(
  v.literal('running'),
  v.literal('ok'),
  v.literal('paused'),
  v.literal('error'),
);

export const runSummaryValidator = v.record(v.string(), v.number());

export type RunKind = 'discovery' | 'drain' | 'refresh';
export type RunSummary = Record<string, number>;

export const RUN_LOG_PAGE = 20;

export const RUN_LOG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const RUN_LOG_TRIM = 10;

export const QUEUE_PAGE_SIZE = 12;

export const ENQUEUE_PASTE_MAX = 20000;
