import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { STORES } from '@matvis/shared';
import { QUEUE_STATUSES } from './model/ingest';
import { netContentFrom, soldByFrom } from './model/project';
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

/** The shape a pre-migration `catalog` row carries: three fields the schema no
 * longer declares, still sitting in stored data. Read through a cast because
 * the generated `Doc` type describes the schema, not the rows on disk. */
type LegacySizeFields = {
  packageSize?: number;
  packageSizeUnit?: string;
  salesUnit?: string;
};

/** One page of the unit migration.
 *
 * This is a local re-derivation, not a re-fetch. `packageSizeUnit` was stored
 * verbatim on the clean row, so resolving it to a canonical unit is a pure
 * function of data already here and costs no Coop traffic. That is the whole
 * reason this migration is cheap: a projector change normally means
 * re-projecting from a source payload, and those are not stored.
 *
 * Uses `replace` rather than `patch` so the three legacy fields actually
 * disappear. A patch would leave them as undeclared extras, which is exactly
 * what fails validation when schema checking is turned back on.
 *
 * `fetchedAt` is carried forward untouched. Rewriting a row is not verifying
 * it, and stamping it here would claim a freshness this never earned. */
export const normalizeUnitsPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scanned: v.number(),
    rewritten: v.number(),
    unresolved: v.number(),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('catalog')
      .paginate({ cursor, numItems: RECOUNT_CATALOG_PAGE });

    let rewritten = 0;
    let unresolved = 0;

    for (const row of page.page) {
      const legacy = row as unknown as LegacySizeFields;
      const hasLegacy =
        legacy.packageSize !== undefined ||
        legacy.packageSizeUnit !== undefined ||
        legacy.salesUnit !== undefined;
      if (!hasLegacy) continue;

      const netContent =
        row.netContent ??
        netContentFrom(legacy.packageSize, legacy.packageSizeUnit);
      const soldBy = row.soldBy ?? soldByFrom(legacy.salesUnit);

      // A size that was stated but did not resolve is worth counting: it is the
      // only signal that the lookup table has a gap.
      if (netContent === undefined && legacy.packageSize !== undefined) {
        unresolved += 1;
      }

      const { _id, _creationTime, ...fields } = row;
      const next = { ...fields, netContent, soldBy };
      delete (next as LegacySizeFields).packageSize;
      delete (next as LegacySizeFields).packageSizeUnit;
      delete (next as LegacySizeFields).salesUnit;

      await ctx.db.replace(_id, next);
      rewritten += 1;
    }

    return {
      scanned: page.page.length,
      rewritten,
      unresolved,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Pause ingest before running this, for the same reason `rebuildCounters`
 * says so: it pages across many transactions and a live drain writing rows
 * underneath it is one more thing to reason about for no benefit.
 *
 * Idempotent. A row already carrying `netContent` keeps it, and a row with no
 * legacy fields is skipped, so a re-run after a failure resumes rather than
 * double-converting. */
export const normalizeUnits = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    rewritten: v.number(),
    unresolved: v.number(),
    pages: v.number(),
  }),
  handler: async (ctx) => {
    const totals = { scanned: 0, rewritten: 0, unresolved: 0, pages: 0 };
    let cursor: string | null = null;
    for (;;) {
      const page: {
        scanned: number;
        rewritten: number;
        unresolved: number;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runMutation(internal.backfill.normalizeUnitsPage, {
        cursor,
      });
      totals.scanned += page.scanned;
      totals.rewritten += page.rewritten;
      totals.unresolved += page.unresolved;
      totals.pages += 1;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return totals;
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
