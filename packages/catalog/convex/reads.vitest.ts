/// <reference types="vite/client" />
import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { countReads, handlerOf, type ReadCounts } from '@matvis/shared/testing';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx } from './_generated/server';
import * as backfill from './backfill';
import { RECOUNT_CATALOG_PAGE } from './backfill';
import * as catalog from './catalog';
import { CATALOG_COUNT_KEY, readCounter } from './model/counters';
import { FRESHNESS_SAMPLE } from './model/ingest';
import { readFreshness } from './model/ops';
import { upsertClean } from './model/project';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

type Test = ReturnType<typeof convexTest>;

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

async function seed(t: Test, eans: string[]) {
  await t.run(async (ctx) => {
    for (const ean of eans) {
      for (const store of STORES) {
        await upsertClean(ctx, { ean, name: `Mellanmjölk ${ean}`, store });
      }
    }
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

    expect(counts.ranges).toHaveLength(MAX_EANS_PER_LOOKUP);
    expect(new Set(counts.ranges.map((range) => range.index))).toEqual(
      new Set(['by_ean_store']),
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
    await t.mutation(internal.backfill.writeCounters, {
      counts: { 'queue:pending': 1, 'queue:done': 2, 'catalog:ica': 3 },
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

describe('readFreshness', () => {
  test('reads one bounded page however big the catalog gets', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let n = 0; n < FRESHNESS_SAMPLE + 50; n += 1) {
        await ctx.db.insert('catalog', {
          ean: `750000000${String(n).padStart(4, '0')}`,
          name: `Product ${n}`,
          store: 'coop',
        });
      }
    });
    await t.mutation(internal.backfill.writeCounters, {
      counts: { catalog: FRESHNESS_SAMPLE + 50, 'catalog:verified': 0 },
    });

    const counts = await countQuery(t, (ctx) => readFreshness(ctx));
    // Two counter lookups plus the one capped scan, and nothing that grows
    // with the table.
    expect(counts.ranges).toEqual([
      { table: 'app_counters', kind: 'index', index: 'by_key' },
      { table: 'app_counters', kind: 'index', index: 'by_key' },
      { table: 'catalog', kind: 'scan', index: null },
    ]);
    expect(counts.docs).toBe(FRESHNESS_SAMPLE + 2);
  });
});

describe('rebuildCounters', () => {
  test('reads each catalog page exactly once', async () => {
    const t = convexTest(schema, modules);
    const rows = RECOUNT_CATALOG_PAGE + 1;
    await t.run(async (ctx) => {
      for (let n = 0; n < rows; n += 1) {
        await ctx.db.insert('catalog', {
          ean: `750000000${String(n).padStart(4, '0')}`,
          name: `Product ${n}`,
          store: 'coop',
        });
      }
    });

    const counts = await countMutation(t, (ctx) =>
      handlerOf(backfill.recountPage)(ctx, { table: 'catalog', cursor: null }),
    );
    expect(counts.ranges).toEqual([
      { table: 'catalog', kind: 'scan', index: null },
    ]);
    expect(counts.docs).toBe(RECOUNT_CATALOG_PAGE);
    expect(counts.gets).toBe(0);

    const result = await t.action(internal.backfill.rebuildCounters, {
      scope: 'catalog',
    });
    // One extra page closes the catalog scan and one more walks the empty
    // `eans` table.
    expect(result.pages).toBe(Math.ceil(rows / RECOUNT_CATALOG_PAGE) + 1);
    expect(result.catalog).toMatchObject({ total: rows, coop: rows });
  });
});
