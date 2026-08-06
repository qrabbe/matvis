import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { CleanFields } from './model/project';
import { QUEUE_STATUSES } from './model/ingest';
import { queueCountKey, setCounter, NEVER_FETCHED_KEY } from './model/counters';

type CleanPage = {
  items: CleanFields[];
  continueCursor: string;
  isDone: boolean;
};

export const rebuildCleanFromRaw = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ pages: v.number(), inserted: v.number() }),
  handler: async (ctx, { batchSize }) => {
    const numItems = batchSize ?? 200;
    let pages = 0;
    let inserted = 0;

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

const RECOUNT_QUEUE_PAGE = 1000;
export const RECOUNT_RAW_PAGE = 200;

type CountPage = {
  counts: Record<string, number>;
  continueCursor: string;
  isDone: boolean;
};

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

/** Pause ingest before running this. It pages across many transactions while
 * the live helpers keep bumping, so a run against a working drain lands off. */
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

    const totals: Record<string, number> = {};
    if (doQueue) {
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
