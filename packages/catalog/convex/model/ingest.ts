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

/** Longest error text kept on a queue row or a run row, so one huge upstream
 * message cannot dominate the document. */
export const MAX_ERROR_LENGTH = 500;

/** A queue row as a reader sees it, which is every stored field. Nothing on a
 * queue row is a secret, and `lastError` is the whole point of reading one. */
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

/** Queue row counts per status, with `capped` set when a count hit its ceiling. */
export const queueStatsValidator = v.object({
  pending: v.number(),
  processing: v.number(),
  done: v.number(),
  skipped: v.number(),
  failed: v.number(),
  capped: v.boolean(),
});

/** How stale the catalog is. `oldestFetchedAt` is null when nothing scanned has
 * ever been fetched. */
export const freshnessStatsValidator = v.object({
  neverFetched: v.number(),
  neverFetchedCapped: v.boolean(),
  oldestFetchedAt: v.union(v.number(), v.null()),
});

/** An error as a bounded string, whatever was thrown. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

// ── Run log and pause switch ─────────────────────────────────────────────────

/** Which action an `ingest_runs` row is recording. */
export const runKindValidator = v.union(
  v.literal('discovery'),
  v.literal('drain'),
  v.literal('refresh'),
);

/**
 * How one logged invocation settled. `running` is written on start and replaced
 * when the action returns or throws, so a row still reading `running` long after
 * `startedAt` is an invocation that died without settling (wall clock, deploy).
 */
export const runStatusValidator = v.union(
  v.literal('running'),
  v.literal('ok'),
  v.literal('paused'),
  v.literal('error'),
);

/** Every ingest action returns a flat bag of counts, which is what makes one
 * validator enough to store all three kinds of summary. */
export const runSummaryValidator = v.record(v.string(), v.number());

export type RunKind = 'discovery' | 'drain' | 'refresh';
export type RunSummary = Record<string, number>;

/** Runs the console lists, newest first. */
export const RUN_LOG_PAGE = 20;

/** How long a run row is kept before the next run sweeps it. Long enough to
 * cover "what happened over the weekend", short enough that the table does not
 * grow forever behind an hourly cron. */
export const RUN_LOG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Expired run rows deleted per new run. Bounded so writing a run row stays a
 * fixed cost no matter how much backlog there is to clear. */
export const RUN_LOG_TRIM = 20;

/** Queue rows per page in the console's failed list. */
export const QUEUE_PAGE_SIZE = 25;

/** EANs one console paste may enqueue. Above the sitemap's whole product count,
 * so a paste is bounded without ever being the reason an ingest is incomplete. */
export const ENQUEUE_PASTE_MAX = 20000;
