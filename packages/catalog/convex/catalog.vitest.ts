/// <reference types="vite/client" />
import { MAX_EANS_PER_LOOKUP } from '@matvis/shared';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
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

describe('stats', () => {
  test('counts through the maintained counter and lists only stores with rows', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.catalog.stats, {})).toEqual({
      total: 0,
      stores: [],
    });

    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk', store: 'coop' },
      { ean: '7310865085734', name: 'Smör', store: 'coop' },
      { ean: '7310865085733', name: 'Mellanmjölk 1,5%', store: 'ica' },
    ]);
    expect(await t.query(api.catalog.stats, {})).toEqual({
      total: 3,
      stores: ['ica', 'coop'],
    });

    await seed(t, [
      { ean: '7310865085733', name: 'Mellanmjölk 3%', store: 'coop' },
    ]);
    expect(await t.query(api.catalog.stats, {})).toMatchObject({ total: 3 });
  });
});
