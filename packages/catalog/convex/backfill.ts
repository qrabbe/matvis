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
    let pages = 0;
    let inserted = 0;

    // The next page's read does not depend on this page's write, so start it
    // before awaiting the write instead of after. At ~68 pages that turns 136
    // strictly sequential round trips into about half as much wall clock. Both
    // promises go into one `Promise.all` so a failed write cannot leave the
    // in-flight read floating.
    let page: CleanPage = await ctx.runQuery(internal.raw.pageRawCoop, {
      cursor: null,
      numItems,
    });
    for (;;) {
      const nextPage = page.isDone
        ? Promise.resolve(null)
        : ctx.runQuery(internal.raw.pageRawCoop, {
            cursor: page.continueCursor,
            numItems,
          });
      const written =
        page.items.length > 0
          ? ctx.runMutation(internal.raw.upsertCleanBatch, {
              items: page.items,
            })
          : Promise.resolve(0);

      const [count, next]: [number, CleanPage | null] = await Promise.all([
        written,
        nextPage,
      ]);

      inserted += count;
      pages += 1;
      if (!next) break;
      page = next;
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
 * Recompute the maintained counters the admin overview reads: one per queue
 * status, plus the `raw_coop` never-fetched total.
 *
 * Run this ONCE after deploying the counters. It is NOT optional: the counters
 * start absent, and the write helpers bump them by deltas, so an un-backfilled
 * deployment counts a claim as pending −1 and shows NEGATIVE numbers rather than
 * merely low ones. After the first run it is a repair tool — `model/ops.ts` keeps
 * the counters through every write, so this is what proves they held or fixes
 * them if they did not.
 *
 * `scope` exists because the two halves cost wildly different amounts. The queue
 * is ~13k rows of a couple hundred bytes, about 2.5 MB — free, run it whenever.
 * `raw_coop` is ~13.5k FULL Coop payloads averaging ~2.85 kB, about 38 MB, which
 * is the one worth waiting for a quiet moment. Note that splitting it across
 * more runs does not make it cheaper: the bytes are the bytes, the scope flag
 * only lets you choose WHEN to spend each half.
 *
 * Until the `raw` half has run, `freshness.neverFetched` on the console is wrong
 * (and drifts further down as the refresh sweep stamps rows); every queue count
 * is correct as soon as the `queue` half has.
 *
 * PAUSE INGEST FIRST (the console's switch, or `ops.setPaused`). The scan pages
 * across many transactions while the live helpers keep bumping, so a run against
 * a working drain will land a few off. Nothing breaks if it does — run it again
 * on a quiet deployment.
 */
export const rebuildCounters = internalAction({
  args: {
    scope: v.optional(
      v.union(v.literal('queue'), v.literal('raw'), v.literal('all')),
    ),
  },
  returns: v.object({
    queue: v.union(v.record(v.string(), v.number()), v.null()),
    neverFetched: v.union(v.number(), v.null()),
    pages: v.number(),
  }),
  handler: async (ctx, { scope }) => {
    const doQueue = scope !== 'raw';
    const doRaw = scope !== 'queue';

    // Only seed the keys this run is authoritative for. Seeding the other half
    // to zero would WIPE a count an earlier run got right.
    const totals: Record<string, number> = {};
    if (doQueue) {
      // Statuses with no rows still need an explicit zero, or a stale count from
      // before the recount would survive it.
      for (const status of QUEUE_STATUSES) totals[queueCountKey(status)] = 0;
    }
    if (doRaw) totals[NEVER_FETCHED_KEY] = 0;

    const steps = [
      ...(doQueue ? [internal.backfill.recountQueuePage] : []),
      ...(doRaw ? [internal.backfill.recountRawPage] : []),
    ];

    let pages = 0;
    for (const step of steps) {
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

    let queue: Record<string, number> | null = null;
    if (doQueue) {
      queue = {};
      for (const status of QUEUE_STATUSES) {
        queue[status] = totals[queueCountKey(status)] ?? 0;
      }
    }
    return {
      queue,
      neverFetched: doRaw ? totals[NEVER_FETCHED_KEY] : null,
      pages,
    };
  },
});
