import type { StoreSlug } from '@matvis/shared';
import { v, type Infer } from 'convex/values';
import { storeValidator } from './fields';

export { ENQUEUE_PASTE_MAX, QUEUE_MAINTENANCE_LIMIT } from '../../src/limits';

/** Three states, and every one of them is either work or a memo.
 *
 * There is no `done`. A row whose product reached the catalog is deleted,
 * because the catalog row is the record and a second copy of "this worked" is
 * just a table that grows until someone empties it by hand.
 *
 * There is no `failed` either. A failed fetch goes back to `pending` carrying
 * its error and its attempt count, so the next run retries it without anyone
 * pressing anything.
 *
 * `skipped` is the one terminal state, and it is a memo rather than an outcome:
 * the store returned no item for this EAN. It has to persist, or the fill sweep
 * re-queues every barcode the store does not stock on every pass, forever. */
export const queueStatusValidator = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('skipped'),
);

export type QueueStatus = Infer<typeof queueStatusValidator>;

/** The iteration order the counter keys are read back in. */
export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending',
  'processing',
  'skipped',
];

/** What a lane reports for one claimed row. Deliberately not the queue status:
 * an outcome is what happened during the fetch, a status is where the row sits
 * afterwards, and only `skipped` is spelled the same in both. `stored` deletes
 * the row and `failed` returns it to `pending`. */
export const fetchOutcomeValidator = v.union(
  v.literal('stored'),
  v.literal('skipped'),
  v.literal('failed'),
);

export type FetchOutcome = Infer<typeof fetchOutcomeValidator>;

export const COOP_BATCH_SIZE = 500;

/** How many EANs one drain batch claims, per store, because the chains do not
 * cost the same per product. Coop resolves up to 500 barcodes in a single
 * request. ICA publishes no batch endpoint at all, so a batch of n is n
 * separate page fetches and has to stay small enough to finish inside one
 * action. */
const BATCH_SIZE_BY_STORE: Partial<Record<StoreSlug, number>> = {
  coop: COOP_BATCH_SIZE,
  ica: 25,
};

const DEFAULT_BATCH_SIZE = 50;

export function batchSizeFor(store: StoreSlug): number {
  return BATCH_SIZE_BY_STORE[store] ?? DEFAULT_BATCH_SIZE;
}

/** The fill sweep walks `eans` a page at a time and enqueues whatever `catalog`
 * is missing, so a full pass is spread across runs rather than rescanning the
 * whole table every tick. */
export const FILL_PAGE_SIZE = 500;

/** One number for one press. A run is a sweep followed by a fetch chain, and
 * this is how many rounds each half gets before it stops on its own. */
export const DEFAULT_RUN_BATCHES = 4;

export const STALE_CLAIM_MS = 30 * 60 * 1000;

export const ENQUEUE_CHUNK = 200;

/** Ceiling on the batches a single console press may schedule. Chains that
 * reschedule themselves are stopped by pause, this only bounds the opening
 * request. */
export const MAX_RUN_BATCHES = 30;

export const MAX_ERROR_LENGTH = 500;

export const queueRowValidator = v.object({
  _id: v.id('ingest_queue'),
  _creationTime: v.number(),
  ean: v.string(),
  store: storeValidator,
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
  skipped: v.number(),
});

export type QueueStats = Infer<typeof queueStatsValidator>;

export const fillStatsValidator = v.object({
  eansKnown: v.number(),
  cursorAtEnd: v.boolean(),
});

export type FillStats = Infer<typeof fillStatsValidator>;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Rows the freshness buckets are read off. Bounded because bucketing the whole
 * table by age is a scan, and `reads.vitest.ts` is there to keep it bounded. */
export const FRESHNESS_SAMPLE = 200;

/** `verified` and `never` are exact and cover the whole table. Everything under
 * `sample` covers only the rows that were looked at, which is why it is nested
 * rather than sitting alongside them: the two are not the same kind of number
 * and must not read as if they were. */
export const freshnessValidator = v.object({
  verified: v.number(),
  never: v.number(),
  sample: v.object({
    size: v.number(),
    week: v.number(),
    month: v.number(),
    older: v.number(),
    never: v.number(),
  }),
});

export type Freshness = Infer<typeof freshnessValidator>;

export const coverageValidator = v.object({
  measuredAt: v.union(v.number(), v.null()),
  total: v.number(),
  fields: v.array(v.object({ field: v.string(), count: v.number() })),
});

export type Coverage = Infer<typeof coverageValidator>;

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export const runKindValidator = v.union(v.literal('drain'), v.literal('fill'));

export const runStatusValidator = v.union(
  v.literal('running'),
  v.literal('ok'),
  v.literal('paused'),
  v.literal('error'),
);

export const runSummaryValidator = v.record(v.string(), v.number());

export type RunKind = Infer<typeof runKindValidator>;
export type RunSummary = Infer<typeof runSummaryValidator>;

export const RUN_LOG_PAGE = 20;

/** Six months, not the fortnight this used to be. The automation gate asks for
 * several weeks of stable added/skipped/failed history before anything is
 * scheduled, and a 14 day window cannot show that: under manual operation runs
 * are sparse, so a fortnight is a handful of points. The table stays small
 * because runs are counted in tens, and the trim is bounded per write either
 * way. */
export const RUN_LOG_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export const RUN_LOG_TRIM = 10;

/** Runs the trend reads. Deliberately more than `RUN_LOG_PAGE`: the log answers
 * "what did the last run do" and this answers "is it still finding anything",
 * which needs a longer arm. */
export const RUN_HISTORY_PAGE = 60;

export const runPointValidator = v.object({
  startedAt: v.number(),
  kind: runKindValidator,
  status: runStatusValidator,
  added: v.number(),
  skipped: v.number(),
  failed: v.number(),
  claimed: v.number(),
});

export type RunPoint = Infer<typeof runPointValidator>;

export const QUEUE_PAGE_SIZE = 12;
