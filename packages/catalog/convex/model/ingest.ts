import { v, type Infer } from 'convex/values';

export { ENQUEUE_PASTE_MAX, QUEUE_MAINTENANCE_LIMIT } from '../../src/limits';

export const queueStatusValidator = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('done'),
  v.literal('skipped'),
  v.literal('failed'),
);

export type QueueStatus = Infer<typeof queueStatusValidator>;

/** The iteration order the counter keys are read back in. */
export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending',
  'processing',
  'done',
  'skipped',
  'failed',
];

export const COOP_BATCH_SIZE = 500;

export const DEFAULT_QUEUE_BATCHES = 4;

/** The fill sweep walks `eans` a page at a time and enqueues whatever `catalog`
 * is missing, so a full pass is spread across runs rather than rescanning the
 * whole table every tick. */
export const FILL_PAGE_SIZE = 500;

export const DEFAULT_FILL_BATCHES = 4;

export const STALE_CLAIM_MS = 30 * 60 * 1000;

export const ENQUEUE_CHUNK = 200;

/** Ceiling on the batches a single console press may schedule, for both drain
 * and fill. Chains that reschedule themselves are stopped by pause, this only
 * bounds the opening request. */
export const MAX_RUN_BATCHES = 30;

export const QUEUE_DEDUP_SCAN = 8;

export const MAX_ERROR_LENGTH = 500;

export const queueRowValidator = v.object({
  _id: v.id('coop_ingest_queue'),
  _creationTime: v.number(),
  ean: v.string(),
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
