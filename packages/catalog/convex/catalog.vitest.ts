/// <reference types="vite/client" />
import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { upsertClean } from './model/project';

const modules = import.meta.glob('./**/*.ts');

const page = { numItems: 20, cursor: null };

type Seed = { ean: string; name: string; store?: 'coop' | 'ica' };

async function seed(t: ReturnType<typeof convexTest>, rows: Seed[]) {
  await t.run(async (ctx) => {
    for (const row of rows) {
      await upsertClean(ctx, {
        ean: row.ean,
        name: row.name,
        store: row.store ?? 'coop',
      });
    }
  });
}

const names = (result: { page: { name: string }[] }) =>
  result.page.map((row) => row.name);

describe('search', () => {
  test('with no term it returns the whole table, newest first', async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk' },
      { ean: '7310865085734', name: 'Smör' },
    ]);

    const result = await t.query(api.catalog.search, { paginationOpts: page });
    expect(names(result)).toEqual(['Smör', 'Mellanmjölk']);
    expect(result.isDone).toBe(true);
  });

  test('a word runs the name index and a digit string runs the EAN index', async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk laktosfri' },
      { ean: '7310865085734', name: 'Smör normalsaltat' },
    ]);

    const byName = await t.query(api.catalog.search, {
      q: 'laktosfri',
      paginationOpts: page,
    });
    expect(names(byName)).toEqual(['Mellanmjölk laktosfri']);

    const byEan = await t.query(api.catalog.search, {
      q: '7310865085734',
      paginationOpts: page,
    });
    expect(names(byEan)).toEqual(['Smör normalsaltat']);

    const short = await t.query(api.catalog.search, {
      q: '731',
      paginationOpts: page,
    });
    expect(short.page).toEqual([]);
  });
});

describe('getByEan', () => {
  test('returns every store row for one EAN, and nothing for an unknown one', async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk', store: 'coop' },
      { ean: '7310865085733', name: 'Mellanmjölk 1,5%', store: 'ica' },
      { ean: '7310865085734', name: 'Smör', store: 'coop' },
    ]);

    const rows = await t.query(api.catalog.getByEan, { ean: '7310865085733' });
    expect(rows.map((row) => row.store).sort()).toEqual(['coop', 'ica']);
    expect(
      await t.query(api.catalog.getByEan, { ean: '0000000000000' }),
    ).toEqual([]);
  });
});

describe('getManyByEan', () => {
  test('looks a repeated EAN up once and returns one flat array', async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk', store: 'coop' },
      { ean: '7310865085733', name: 'Mellanmjölk 1,5%', store: 'ica' },
      { ean: '7310865085734', name: 'Smör', store: 'coop' },
    ]);

    const rows = await t.query(api.catalog.getManyByEan, {
      eans: ['7310865085733', '7310865085734', '7310865085733', 'unknown'],
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.name).sort()).toEqual([
      'Mellanmjölk',
      'Mellanmjölk 1,5%',
      'Smör',
    ]);
  });

  test('throws above the shared ceiling rather than truncating', async () => {
    const t = convexTest(schema, modules);
    const eans = Array.from(
      { length: MAX_EANS_PER_LOOKUP + 1 },
      (_, n) => `73108650857${String(n).padStart(2, '0')}`,
    );

    await expect(t.query(api.catalog.getManyByEan, { eans })).rejects.toThrow(
      new RegExp(`at most ${MAX_EANS_PER_LOOKUP} EANs, got ${eans.length}`),
    );

    const repeats = Array.from(
      { length: MAX_EANS_PER_LOOKUP + 1 },
      () => '7310865085733',
    );
    expect(await t.query(api.catalog.getManyByEan, { eans: repeats })).toEqual(
      [],
    );
  });
});

describe('fetchedAt', () => {
  test('is stamped at the write and moves forward on a re-fetch', async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();
    await seed(t, [{ ean: '7310865085733', name: 'Mellanmjölk' }]);

    const [first] = await t.query(api.catalog.getByEan, {
      ean: '7310865085733',
    });
    expect(first!.fetchedAt).toBeGreaterThanOrEqual(before);

    const later = Date.now() + 60_000;
    await t.run(async (ctx) => {
      await upsertClean(
        ctx,
        { ean: '7310865085733', name: 'Mellanmjölk 3%', store: 'coop' },
        later,
      );
    });

    const [again] = await t.query(api.catalog.getByEan, {
      ean: '7310865085733',
    });
    expect(again!.fetchedAt).toBe(later);
    // A replace preserves _creationTime, which is why that field can never
    // stand in for this one.
    expect(again!._creationTime).toBe(first!._creationTime);
  });

  test('a row written before the field existed reads as absent, not as fresh', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('catalog', {
        ean: '7310865085734',
        name: 'Smör',
        store: 'coop',
      });
    });

    const [row] = await t.query(api.catalog.getByEan, {
      ean: '7310865085734',
    });
    expect(row!.fetchedAt).toBeUndefined();
  });
});

describe('health', () => {
  function countFor(
    health: { stores: { store: string; count: number }[] },
    store: string,
  ): number | undefined {
    return health.stores.find((row) => row.store === store)?.count;
  }

  test('counts through the maintained counter and breaks the total down by store', async () => {
    const t = convexTest(schema, modules);
    const empty = await t.query(api.catalog.health, {});
    expect(empty.total).toBe(0);
    // Every chain is reported, so an empty one is visible as empty rather
    // than missing.
    expect(empty.stores).toHaveLength(STORES.length);
    expect(empty.stores.every((row) => row.count === 0)).toBe(true);

    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk', store: 'coop' },
      { ean: '7310865085734', name: 'Smör', store: 'coop' },
      { ean: '7310865085733', name: 'Mellanmjölk 1,5%', store: 'ica' },
    ]);
    const seeded = await t.query(api.catalog.health, {});
    expect(seeded.total).toBe(3);
    expect(countFor(seeded, 'coop')).toBe(2);
    expect(countFor(seeded, 'ica')).toBe(1);
    expect(countFor(seeded, 'lidl')).toBe(0);

    // A replace is not an insert, so neither the total nor the store moves.
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk 3%', store: 'coop' },
    ]);
    const replaced = await t.query(api.catalog.health, {});
    expect(replaced.total).toBe(3);
    expect(countFor(replaced, 'coop')).toBe(2);
  });

  test('publishes counts, freshness and coverage, and withholds the pipeline', async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk', store: 'coop' },
      { ean: '7310865085734', name: 'Smör', store: 'coop' },
    ]);
    // Queue depth exists but must not reach the public shape.
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000009'].map((ean) => ({ ean })),
      source: 'census',
    });

    const health = await t.query(api.catalog.health, {});
    expect(health.total).toBe(2);
    expect(health.stores.find((row) => row.store === 'coop')!.count).toBe(2);
    expect(health.freshness).toMatchObject({ verified: 2, neverFetched: 0 });
    expect(health.coverage.measuredAt).toBeNull();

    // The decision, pinned: operational numbers stay behind the session gate.
    // Sorted, because the return validator normalizes key order.
    expect(Object.keys(health).sort()).toEqual([
      'coverage',
      'freshness',
      'stores',
      'total',
    ]);
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain('pending');
    expect(serialized).not.toContain('cursor');
  });
});
