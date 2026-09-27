/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { upsertClean } from './model/project';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const PORTAL_FIELDS = new Set([
  'ean',
  'name',
  'brand',
  'packageSizeText',
  'imageUrl',
  'store',
]);

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await upsertClean(ctx, {
      ean: '7310865078216',
      name: 'Mjölk Laktosfri Standard',
      brand: 'Arla',
      packageSizeText: '1 liter',
      imageUrl: 'https://example.test/mjolk.jpg',
      store: 'coop',
    });
    await upsertClean(ctx, {
      ean: '7310865078217',
      name: 'Mjölk Laktosfri 3%',
      store: 'ica',
    });
  });
}

describe('portal.search', () => {
  test('returns exactly the six list fields, nothing internal', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const page = await t.query(api.portal.search, {
      q: 'mjölk',
      store: 'coop',
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(page.page).toHaveLength(1);
    expect(Object.keys(page.page[0]!).sort()).toEqual(
      [...PORTAL_FIELDS].sort(),
    );
  });

  test('filters to the requested store, unlike the plain HTTP search', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const coop = await t.query(api.portal.search, {
      q: 'mjölk',
      store: 'coop',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(coop.page.map((row) => row.store)).toEqual(['coop']);

    const ica = await t.query(api.portal.search, {
      q: 'mjölk',
      store: 'ica',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(ica.page.map((row) => row.store)).toEqual(['ica']);
  });

  test('an empty q lists the store, newest first, until step 05 replaces it', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const page = await t.query(api.portal.search, {
      store: 'ica',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((row) => row.store)).toEqual(['ica']);
  });
});
