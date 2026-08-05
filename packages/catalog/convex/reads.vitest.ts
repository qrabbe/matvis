/// <reference types="vite/client" />
import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { countReads, handlerOf, type ReadCounts } from '@matvis/shared/testing';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx } from './_generated/server';
import * as backfill from './backfill';
import { RECOUNT_RAW_PAGE } from './backfill';
import * as catalog from './catalog';
import { CATALOG_COUNT_KEY, readCounter } from './model/counters';
import schema from './schema';

// The read-count gate. An N+1 pattern does not fail a test, does not slow CI and
// does not surface until the table is large enough to notice it on the bill, so
// the counts are asserted as exact equalities here. A number that moves is
// either a regression or a deliberate improvement, and both belong in the diff.

const modules = import.meta.glob('./**/*.ts');

type Test = ReturnType<typeof convexTest>;

/** Run `read` in a real query transaction and report what it read. */
async function countQuery(
  t: Test,
  read: (ctx: QueryCtx) => Promise<unknown>,
): Promise<ReadCounts> {
  const measured = async (ctx: QueryCtx) => {
    const counted = countReads(ctx);
    await read(counted.ctx);
    return counted.counts;
  };
  return await t.query(measured);
}

/** The same, for a handler that needs a mutation ctx. */
async function countMutation(
  t: Test,
  write: (ctx: MutationCtx) => Promise<unknown>,
): Promise<ReadCounts> {
  const measured = async (ctx: MutationCtx) => {
    const counted = countReads(ctx);
    await write(counted.ctx);
    return counted.counts;
  };
  return await t.mutation(measured);
}

/** Write clean rows for `eans` in every known store, through the real upsert. */
async function seed(t: Test, eans: string[]) {
  await t.mutation(internal.raw.upsertCleanBatch, {
    items: eans.flatMap((ean) =>
      STORES.map((store) => ({
        ean,
        name: `Mellanmjölk ${ean}`,
        store,
        sourceTable: 'raw_coop',
        sourceId: `raw-${store}-${ean}`,
      })),
    ),
  });
}

const eansUpTo = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `73108650857${String(i).padStart(2, '0')}`,
  );

describe('getManyByEan', () => {
  test('a full batch is one index read per EAN, not one per store', async () => {
    const t = convexTest(schema, modules);
    const eans = eansUpTo(MAX_EANS_PER_LOOKUP);
    await seed(t, eans);

    const counts = await countQuery(t, (ctx) =>
      handlerOf(catalog.getManyByEan)(ctx, { eans }),
    );

    // The catalog is keyed by (store, EAN) and `by_ean` is prefixed on the EAN,
    // so one range returns every store's row for that EAN. 50 EANs is 50 ranges
    // whatever the number of chains, and never a point read.
    expect(counts.ranges).toHaveLength(MAX_EANS_PER_LOOKUP);
    expect(new Set(counts.ranges.map((range) => range.index))).toEqual(
      new Set(['by_ean']),
    );
    expect(counts.gets).toBe(0);
    expect(counts.docs).toBe(MAX_EANS_PER_LOOKUP * STORES.length);
  });

  test('a repeated EAN is one index read, not one per mention', async () => {
    const t = convexTest(schema, modules);
    const ean = eansUpTo(1)[0]!;
    await seed(t, [ean]);

    const counts = await countQuery(t, (ctx) =>
      handlerOf(catalog.getManyByEan)(ctx, { eans: [ean, ean, ean] }),
    );
    expect(counts.ranges).toHaveLength(1);
  });
});

describe('search', () => {
  // One search-index read serves a whole page, so the read count is the same for
  // a page of 5 and a page of 25. Two invocations rather than one, because
  // convex-test allows a single `.paginate()` per execution as a deployment does.
  const searchPage = (t: Test, numItems: number) =>
    countQuery(t, (ctx) =>
      handlerOf(catalog.search)(ctx, {
        q: 'Mellanmjölk',
        paginationOpts: { numItems, cursor: null },
      }),
    );

  test('is one search-index read whatever the result count', async () => {
    const t = convexTest(schema, modules);
    await seed(t, eansUpTo(30));

    const oneRange = [
      { table: 'catalog', kind: 'search', index: 'search_name' },
    ];
    expect((await searchPage(t, 5)).ranges).toEqual(oneRange);
    expect((await searchPage(t, 25)).ranges).toEqual(oneRange);
  });
});

describe('the maintained counters', () => {
  test('read a single row on by_key and never scan app_counters', async () => {
    const t = convexTest(schema, modules);
    await seed(t, eansUpTo(3));
    // Neighbours on the same table, so a scan would show up as extra rows.
    await t.mutation(internal.backfill.writeCounters, {
      counts: { 'queue:pending': 1, 'queue:done': 2, 'raw_coop:x': 3 },
    });

    const counts = await countQuery(t, (ctx) =>
      readCounter(ctx, CATALOG_COUNT_KEY),
    );
    expect(counts.ranges).toEqual([
      { table: 'app_counters', kind: 'index', index: 'by_key' },
    ]);
    expect(counts.docs).toBe(1);
    expect(counts.gets).toBe(0);
  });
});

describe('rebuildCounters', () => {
  test('reads each raw page exactly once', async () => {
    const t = convexTest(schema, modules);
    const rows = RECOUNT_RAW_PAGE + 1;
    await t.run(async (ctx) => {
      for (let n = 0; n < rows; n += 1) {
        await ctx.db.insert('raw_coop', {
          ean: `750000000${String(n).padStart(4, '0')}`,
          name: `Product ${n}`,
        });
      }
    });

    // One page mutation is one range over `raw_coop` and exactly a page of rows.
    // This is the 38 MB scan, so a second range here is several times that.
    const counts = await countMutation(t, (ctx) =>
      handlerOf(backfill.recountRawPage)(ctx, { cursor: null }),
    );
    expect(counts.ranges).toEqual([
      { table: 'raw_coop', kind: 'scan', index: null },
    ]);
    expect(counts.docs).toBe(RECOUNT_RAW_PAGE);
    expect(counts.gets).toBe(0);

    // And the action walks the table in one page per pageful, so the per-page
    // count above is the whole cost of a run.
    const result = await t.action(internal.backfill.rebuildCounters, {
      scope: 'raw',
    });
    expect(result.pages).toBe(Math.ceil(rows / RECOUNT_RAW_PAGE));
    expect(result.neverFetched).toBe(rows);
  });
});
