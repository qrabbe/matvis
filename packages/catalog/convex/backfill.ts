import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { STORES } from '@matvis/shared';
import { QUEUE_STATUSES } from './model/ingest';
import {
  catalogStoreKey,
  queueCountKey,
  setCounter,
  CATALOG_COUNT_KEY,
  CATALOG_VERIFIED_KEY,
  EANS_COUNT_KEY,
} from './model/counters';

const RECOUNT_QUEUE_PAGE = 1000;
export const RECOUNT_CATALOG_PAGE = 500;

const countedTableValidator = v.union(
  v.literal('coop_ingest_queue'),
  v.literal('catalog'),
  v.literal('eans'),
);

type CountedTable = 'coop_ingest_queue' | 'catalog' | 'eans';

type CountPage = {
  counts: Record<string, number>;
  continueCursor: string;
  isDone: boolean;
};

/** One page of one table, tallied into counter keys. Each table derives its own
 * keys, so the paging, the cursor and the return shape are written once. */
export const recountPage = internalMutation({
  args: { table: countedTableValidator, cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    counts: v.record(v.string(), v.number()),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { table, cursor }) => {
    const numItems =
      table === 'coop_ingest_queue' ? RECOUNT_QUEUE_PAGE : RECOUNT_CATALOG_PAGE;
    const page = await ctx.db.query(table).paginate({ cursor, numItems });

    const counts: Record<string, number> = {};
    const tally = (key: string) => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    // Narrowed by field rather than by `table`: one paginate call means
    // `page.page` is a union, and the table name does not narrow it.
    for (const row of page.page) {
      if ('status' in row) tally(queueCountKey(row.status));
      else if ('name' in row) {
        tally(catalogStoreKey(row.store));
        if (row.fetchedAt !== undefined) tally(CATALOG_VERIFIED_KEY);
      }
    }
    if (table === 'catalog') counts[CATALOG_COUNT_KEY] = page.page.length;
    if (table === 'eans') counts[EANS_COUNT_KEY] = page.page.length;

    return {
      counts,
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
      v.union(v.literal('queue'), v.literal('catalog'), v.literal('all')),
    ),
  },
  returns: v.object({
    queue: v.union(v.record(v.string(), v.number()), v.null()),
    catalog: v.union(v.record(v.string(), v.number()), v.null()),
    pages: v.number(),
  }),
  handler: async (ctx, { scope }) => {
    const doQueue = scope !== 'catalog';
    const doCatalog = scope !== 'queue';

    const totals: Record<string, number> = {};
    if (doQueue) {
      for (const status of QUEUE_STATUSES) totals[queueCountKey(status)] = 0;
    }
    if (doCatalog) {
      totals[CATALOG_COUNT_KEY] = 0;
      totals[EANS_COUNT_KEY] = 0;
      totals[CATALOG_VERIFIED_KEY] = 0;
      for (const store of STORES) totals[catalogStoreKey(store)] = 0;
    }

    const tables: CountedTable[] = [
      ...(doQueue ? (['coop_ingest_queue'] as const) : []),
      ...(doCatalog ? (['catalog', 'eans'] as const) : []),
    ];

    let pages = 0;
    for (const table of tables) {
      let cursor: string | null = null;
      for (;;) {
        const page: CountPage = await ctx.runMutation(
          internal.backfill.recountPage,
          { table, cursor },
        );
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
    let catalog: Record<string, number> | null = null;
    if (doCatalog) {
      catalog = {
        total: totals[CATALOG_COUNT_KEY] ?? 0,
        eans: totals[EANS_COUNT_KEY] ?? 0,
        verified: totals[CATALOG_VERIFIED_KEY] ?? 0,
      };
      for (const store of STORES) {
        catalog[store] = totals[catalogStoreKey(store)] ?? 0;
      }
    }
    return { queue, catalog, pages };
  },
});
