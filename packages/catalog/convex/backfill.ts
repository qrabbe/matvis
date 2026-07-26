import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { CleanFields } from './model/project';
import { QUEUE_STATUSES } from './model/ingest';
import { queueCountKey, setCounter, NEVER_FETCHED_KEY } from './model/counters';

/** One page of `pageRawCoop`. Spelled out because inferring it here would run
 * back through the loop's own `cursor`, which TypeScript refuses to resolve. */
type CleanPage = {
  items: CleanFields[];
  continueCursor: string;
  isDone: boolean;
};

/**
 * Rebuild the clean `catalog` table from every `raw_coop` row. Idempotent: reruns
 * patch existing clean rows rather than duplicating. Run once after the step-04
 * import. Returns how many raw pages and new clean rows it produced.
 *
 * This is the reproject-everything tool: re-run it whenever `CleanFields` or any
 * projector changes, so existing clean rows pick up the new shape. When async
 * enrichment lands it should run the enrichers here too.
 */
export const rebuildCleanFromRaw = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ pages: v.number(), inserted: v.number() }),
  handler: async (ctx, { batchSize }) => {
    const numItems = batchSize ?? 200;
    let cursor: string | null = null;
    let pages = 0;
    let inserted = 0;
    for (;;) {
      const page: CleanPage = await ctx.runQuery(internal.raw.pageRawCoop, {
        cursor,
        numItems,
      });
      if (page.items.length > 0) {
        inserted += await ctx.runMutation(internal.raw.upsertCleanBatch, {
          items: page.items,
        });
      }
      pages += 1;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { pages, inserted };
  },
});

/** Rows per page while recounting. The queue's rows are a couple of hundred
 * bytes; `raw_coop`'s are full Coop payloads averaging ~3 kB with much fatter
 * outliers, so they get a smaller page to stay well inside a transaction. */
const RECOUNT_QUEUE_PAGE = 1000;
const RECOUNT_RAW_PAGE = 200;

type CountPage = {
  counts: Record<string, number>;
  continueCursor: string;
  isDone: boolean;
};

/**
 * Count one page of `coop_ingest_queue` by status. A mutation only so it shares
 * the accumulate-into-counters shape with {@link recountRawPage}; it writes
 * nothing itself.
 */
export const recountQueuePage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    counts: v.record(v.string(), v.number()),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('coop_ingest_queue')
      .paginate({ cursor, numItems: RECOUNT_QUEUE_PAGE });
    const counts: Record<string, number> = {};
    for (const row of page.page) {
      const key = queueCountKey(row.status);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return {
      counts,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Count one page of `raw_coop` rows that carry no `lastFetchedAt`. */
export const recountRawPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    counts: v.record(v.string(), v.number()),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('raw_coop')
      .paginate({ cursor, numItems: RECOUNT_RAW_PAGE });
    const neverFetched = page.page.filter(
      (row) => row.lastFetchedAt === undefined,
    ).length;
    return {
      counts: { [NEVER_FETCHED_KEY]: neverFetched },
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Write the recounted totals in one transaction, so the console never observes
 * a half-written set of numbers. */
export const writeCounters = internalMutation({
  args: { counts: v.record(v.string(), v.number()) },
  returns: v.null(),
  handler: async (ctx, { counts }) => {
    for (const [key, value] of Object.entries(counts)) {
      await setCounter(ctx, key, value);
    }
    return null;
  },
});

/**
 * Recompute every maintained counter the admin overview reads: one per queue
 * status, plus the `raw_coop` never-fetched total.
 *
 * Run this ONCE after deploying the counters, because they start at zero against
 * a queue that already holds rows. After that it is a repair tool — the counters
 * are kept by the write helpers in `model/ops.ts`, so they should not drift, and
 * this is what proves it or fixes it if they do.
 *
 * PAUSE INGEST FIRST (the console's switch, or `ops.setPaused`). The scan pages
 * through both tables across many transactions while the live helpers keep
 * bumping, so a run against a working drain will land a few off. Nothing breaks
 * if it does — run it again on a quiet deployment.
 */
export const rebuildCounters = internalAction({
  args: {},
  returns: v.object({
    queue: v.record(v.string(), v.number()),
    neverFetched: v.number(),
    pages: v.number(),
  }),
  handler: async (ctx) => {
    const totals: Record<string, number> = { [NEVER_FETCHED_KEY]: 0 };
    // Statuses with no rows still need an explicit zero, or a stale count from
    // before the recount would survive it.
    for (const status of QUEUE_STATUSES) totals[queueCountKey(status)] = 0;

    let pages = 0;
    for (const step of [
      internal.backfill.recountQueuePage,
      internal.backfill.recountRawPage,
    ]) {
      let cursor: string | null = null;
      for (;;) {
        const page: CountPage = await ctx.runMutation(step, { cursor });
        for (const [key, value] of Object.entries(page.counts)) {
          totals[key] = (totals[key] ?? 0) + value;
        }
        pages += 1;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    await ctx.runMutation(internal.backfill.writeCounters, { counts: totals });

    const queue: Record<string, number> = {};
    for (const status of QUEUE_STATUSES) {
      queue[status] = totals[queueCountKey(status)] ?? 0;
    }
    return { queue, neverFetched: totals[NEVER_FETCHED_KEY], pages };
  },
});
