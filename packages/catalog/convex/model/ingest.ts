import { v } from 'convex/values';

/**
 * Shared shapes and sizes for the Coop ingest queue. They live here rather than
 * in `ingest.ts` so `schema.ts` can spread the same validators the functions
 * validate against, without importing a module that registers functions.
 */

/** What a queue row resolves through: an exact id, or free text via search. */
export const queueKindValidator = v.union(v.literal('ean'), v.literal('name'));

/**
 * Queue row lifecycle. `pending` → `processing` on claim, then one of the three
 * terminal states: `done` (written to `raw_coop`), `skipped` (nothing to do —
 * Coop has no such product), `failed` (the attempt errored, `lastError` says
 * how).
 */
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

/** Every status, for the stats query and for bulk clears. */
export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending',
  'processing',
  'done',
  'skipped',
  'failed',
];

/**
 * EANs per by-id request. Measured from the old scrape artifacts: 26 requests
 * covered 12,685 EANs and returned 10,043 products, so ~500 per call with up to
 * 457 found in one batch. A 500-EAN batch comes back in about a second and under
 * a megabyte, which is well inside both the action's wall clock and Convex's
 * function result size.
 */
export const COOP_BATCH_SIZE = 500;

/**
 * Batches one worker invocation runs before scheduling its continuation. Actions
 * have a wall-clock limit, so a budget is spent in whole batches and the next
 * invocation starts with a fresh clock rather than looping until done.
 */
export const DEFAULT_QUEUE_BATCHES = 4;

/**
 * Rows the refresh sweep re-fetches per batch. Below {@link COOP_BATCH_SIZE}
 * because claiming a batch both reads and rewrites a full `raw_coop` document
 * per row, and the fat ones (big nutrient tables, animal feeding tables) are an
 * order of magnitude above the ~3.4 kB average.
 */
export const REFRESH_BATCH_SIZE = 250;

/** Batches per sweep run. With a daily cron this re-fetches ~2k rows a day, so
 * the ~13.5k-row catalog turns over about once a week. */
export const DEFAULT_REFRESH_BATCHES = 8;

/**
 * How long a row may sit in `processing` before the next claim takes it back.
 * A worker that dies mid-batch (wall clock, deploy) leaves its claims behind;
 * without this they would never be retried. Comfortably above the action limit
 * so it can't steal rows from a worker that is still running.
 */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

/** Hits ingested per name row. The search endpoint returns near-complete
 * payloads, so the extra hits are catalog breadth at no extra request. */
export const SEARCH_HITS_PER_NAME = 10;

/**
 * EANs per enqueue mutation. Smaller than {@link COOP_BATCH_SIZE} because
 * enqueueing reads one full `raw_coop` document per already-known EAN to decide
 * whether to skip it, and those documents run to a few kilobytes each — 200 of
 * them is about a megabyte, comfortably inside a transaction's read budget.
 */
export const ENQUEUE_CHUNK = 200;

/** Ceiling on the drain a single discovery run may schedule for itself. A first
 * full discovery finds more than this; the queue cron picks up the remainder. */
export const DISCOVERY_DRAIN_MAX_BATCHES = 30;

/** Rows counted per status before the stats query reports `capped`. Keeps a
 * status count from turning into a full scan of a queue holding 13k rows. */
export const QUEUE_STAT_CAP = 1000;

/** Queue rows read per dedup check. One EAN or one search text has at most one
 * live row plus a handful of settled ones, so this is a bound, not a page. */
export const QUEUE_DEDUP_SCAN = 8;

/** Rows one maintenance mutation (clear, requeue) touches before returning. The
 * caller re-runs it until it reports nothing left to do. */
export const QUEUE_MAINTENANCE_LIMIT = 1000;
