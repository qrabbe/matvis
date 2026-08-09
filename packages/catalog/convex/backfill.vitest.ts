/// <reference types="vite/client" />
import { defineSchema } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import {
  catalogStoreKey,
  queueCountKey,
  CATALOG_COUNT_KEY,
  EANS_COUNT_KEY,
} from './model/counters';
import { rememberEan, upsertClean } from './model/project';
import { readCoverage, readFillStats, readQueueStats } from './model/ops';
import type { QueueStatus } from './model/ingest';

const modules = import.meta.glob('./**/*.ts');

async function seedQueue(
  t: ReturnType<typeof convexTest>,
  rows: { status: QueueStatus }[],
) {
  await t.run(async (ctx) => {
    let n = 0;
    for (const row of rows) {
      n += 1;
      await ctx.db.insert('ingest_queue', {
        store: 'coop',
        ean: `730000000000${n}`,
        status: row.status,
        attempts: 0,
        source: 'census',
        enqueuedAt: Date.now(),
      });
    }
  });
}

async function queueStats(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await readQueueStats(ctx));
}

async function fillStats(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await readFillStats(ctx, 'coop'));
}

async function seedCatalog(t: ReturnType<typeof convexTest>, total: number) {
  await t.run(async (ctx) => {
    for (let n = 0; n < total; n += 1) {
      const ean = `750000000000${n}`;
      await rememberEan(ctx, 'coop', ean);
      await upsertClean(ctx, { ean, name: `Product ${n}`, store: 'coop' });
    }
  });
}

async function counters(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    // Every counter key, not a page of them: the coverage keys pushed the
    // total past the old take and silently hid the queue counts.
    const rows = await ctx.db.query('app_counters').take(100);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });
}

describe('rebuildCounters', () => {
  test('a fresh deployment recounts to the right totals', async () => {
    const t = convexTest(schema, modules);
    await seedQueue(t, [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'processing' },
      { status: 'done' },
      { status: 'done' },
    ]);
    await seedCatalog(t, 5);

    const result = await t.action(internal.backfill.rebuildCounters, {});
    expect(result.queue).toEqual({
      pending: 3,
      processing: 1,
      done: 2,
      skipped: 0,
      failed: 0,
    });
    expect(result.catalog).toMatchObject({ total: 5, eans: 5, coop: 5 });
    expect(result.pages).toBe(3);

    expect(await queueStats(t)).toEqual({
      pending: 3,
      processing: 1,
      done: 2,
      skipped: 0,
      failed: 0,
    });
    expect(await fillStats(t)).toMatchObject({
      eansKnown: 5,
    });
  });

  test('an un-backfilled deployment counts negative, and the rebuild repairs it', async () => {
    const t = convexTest(schema, modules);
    await seedQueue(t, [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
    ]);

    await t.mutation(internal.ingest.claimBatch, { store: 'coop', limit: 1 });
    expect(await queueStats(t)).toMatchObject({
      pending: -1,
      processing: 1,
    });

    await t.action(internal.backfill.rebuildCounters, { scope: 'queue' });
    expect(await queueStats(t)).toMatchObject({
      pending: 2,
      processing: 1,
    });
  });

  test('a status with no rows recounts to an explicit zero', async () => {
    const t = convexTest(schema, modules);
    await seedQueue(t, [{ status: 'pending' }]);
    await t.mutation(internal.backfill.writeCounters, {
      counts: { [queueCountKey('failed')]: 7 },
    });

    await t.action(internal.backfill.rebuildCounters, { scope: 'queue' });
    expect(await queueStats(t)).toMatchObject({
      pending: 1,
      failed: 0,
    });
  });

  test('each scope leaves the other half of the counters alone', async () => {
    const t = convexTest(schema, modules);
    await seedQueue(t, [{ status: 'pending' }, { status: 'pending' }]);
    await seedCatalog(t, 1);

    const catalog = await t.action(internal.backfill.rebuildCounters, {
      scope: 'catalog',
    });
    expect(catalog.queue).toBeNull();
    expect(catalog.catalog).toMatchObject({ total: 1, eans: 1, coop: 1 });
    expect(await counters(t)).toMatchObject({
      [CATALOG_COUNT_KEY]: 1,
      [EANS_COUNT_KEY]: 1,
      [catalogStoreKey('coop')]: 1,
    });

    const queue = await t.action(internal.backfill.rebuildCounters, {
      scope: 'queue',
    });
    expect(queue.catalog).toBeNull();
    expect(queue.queue).toMatchObject({ pending: 2 });
    expect(await counters(t)).toMatchObject({
      [CATALOG_COUNT_KEY]: 1,
      [queueCountKey('pending')]: 2,
    });
  });
});

/** The real tables with validation off. Rows on disk carry three fields the
 * schema no longer declares, so this is the only way to stage the situation the
 * migration exists to resolve — and it is exactly what the deployment runs
 * during the migration window, for the same reason. */
const migrationSchema = defineSchema(schema.tables, {
  schemaValidation: false,
});

describe('normalizeUnits', () => {
  /** Rows as they sit on disk before the migration: the three legacy fields
   * the schema no longer declares. Inserted through a cast for the same reason
   * the migration reads them through one. */
  async function seedLegacy(
    t: ReturnType<typeof convexTest>,
    rows: {
      ean: string;
      packageSize?: number;
      packageSizeUnit?: string;
      salesUnit?: string;
    }[],
  ) {
    await t.run(async (ctx) => {
      for (const row of rows) {
        await ctx.db.insert('catalog', {
          ean: row.ean,
          name: `Product ${row.ean}`,
          store: 'coop',
          packageSize: row.packageSize,
          packageSizeUnit: row.packageSizeUnit,
          salesUnit: row.salesUnit,
        } as never);
      }
    });
  }

  async function catalogRows(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => await ctx.db.query('catalog').take(50));
  }

  test('resolves the legacy fields in place and removes them from the row', async () => {
    const t = convexTest(migrationSchema, modules);
    await seedLegacy(t, [
      { ean: '1', packageSize: 0.75, packageSizeUnit: 'Kilogram' },
      { ean: '2', packageSize: 50, packageSizeUnit: 'cl', salesUnit: 'Styck' },
      { ean: '3', packageSize: 6, packageSizeUnit: 'knippe' },
    ]);

    const result = await t.action(internal.backfill.normalizeUnits, {});
    expect(result).toMatchObject({ scanned: 3, rewritten: 3, unresolved: 1 });

    const byEan = new Map((await catalogRows(t)).map((row) => [row.ean, row]));
    expect(byEan.get('1')!.netContent).toEqual({ value: 750, unit: 'g' });
    expect(byEan.get('2')!.netContent).toEqual({ value: 500, unit: 'ml' });
    expect(byEan.get('2')!.soldBy).toBe('piece');
    // Unresolvable stays absent rather than becoming a guess.
    expect(byEan.get('3')!.netContent).toBeUndefined();

    // The replace has to actually drop them, or they linger as undeclared
    // extras and fail validation when schema checking comes back on.
    for (const row of byEan.values()) {
      expect(row).not.toHaveProperty('packageSize');
      expect(row).not.toHaveProperty('packageSizeUnit');
      expect(row).not.toHaveProperty('salesUnit');
    }
  });

  test('carries fetchedAt forward, because a rewrite is not a verification', async () => {
    const t = convexTest(migrationSchema, modules);
    const stamped = Date.now() - 90_000;
    await t.run(async (ctx) => {
      await ctx.db.insert('catalog', {
        ean: '1',
        name: 'Mjölk',
        store: 'coop',
        fetchedAt: stamped,
        packageSize: 1,
        packageSizeUnit: 'l',
      } as never);
    });

    await t.action(internal.backfill.normalizeUnits, {});
    const [row] = await catalogRows(t);
    expect(row!.fetchedAt).toBe(stamped);
    expect(row!.netContent).toEqual({ value: 1000, unit: 'ml' });
  });

  test('is idempotent, so a re-run after a failure resumes rather than doubling', async () => {
    const t = convexTest(migrationSchema, modules);
    await seedLegacy(t, [{ ean: '1', packageSize: 50, packageSizeUnit: 'cl' }]);

    const first = await t.action(internal.backfill.normalizeUnits, {});
    expect(first).toMatchObject({ rewritten: 1 });

    const second = await t.action(internal.backfill.normalizeUnits, {});
    expect(second).toMatchObject({ scanned: 1, rewritten: 0 });

    const [row] = await catalogRows(t);
    expect(row!.netContent).toEqual({ value: 500, unit: 'ml' });
  });
});

describe('repairNetContent', () => {
  /** The state the migration leaves behind for a row whose unit it could not
   * resolve: legacy fields gone, `netContent` never written. A re-run cannot
   * reach these, which is the whole reason the repair exists. */
  async function seedEmptied(
    t: ReturnType<typeof convexTest>,
    rows: { ean: string; netContent?: { value: number; unit: 'g' | 'ml' } }[],
  ) {
    await t.run(async (ctx) => {
      for (const row of rows) {
        await ctx.db.insert('catalog', {
          ean: row.ean,
          name: `Product ${row.ean}`,
          store: 'coop',
          netContent: row.netContent,
        });
      }
    });
  }

  test('fills the gap from replayed legacy fields, through the real lookup', async () => {
    const t = convexTest(schema, modules);
    await seedEmptied(t, [{ ean: '1' }, { ean: '2' }]);

    const result = await t.mutation(internal.backfill.repairNetContent, {
      rows: [
        {
          ean: '1',
          store: 'coop',
          packageSize: 1,
          packageSizeUnit: 'kg',
          salesUnit: 'Vikt',
        },
        {
          ean: '2',
          store: 'coop',
          packageSize: 5,
          packageSizeUnit: 'dl',
        },
      ],
    });
    expect(result).toMatchObject({ patched: 2, stillUnresolved: 0 });

    const byEan = new Map(
      (await t.run(async (ctx) => await ctx.db.query('catalog').take(50))).map(
        (row) => [row.ean, row],
      ),
    );
    expect(byEan.get('1')!.netContent).toEqual({ value: 1000, unit: 'g' });
    expect(byEan.get('1')!.soldBy).toBe('weight');
    expect(byEan.get('2')!.netContent).toEqual({ value: 500, unit: 'ml' });
  });

  test('never overwrites a row that already resolved', async () => {
    const t = convexTest(schema, modules);
    await seedEmptied(t, [{ ean: '1', netContent: { value: 750, unit: 'g' } }]);

    const result = await t.mutation(internal.backfill.repairNetContent, {
      rows: [
        { ean: '1', store: 'coop', packageSize: 999, packageSizeUnit: 'gram' },
      ],
    });
    expect(result).toMatchObject({ patched: 0, skipped: 1 });

    const [row] = await t.run(
      async (ctx) => await ctx.db.query('catalog').take(1),
    );
    expect(row!.netContent).toEqual({ value: 750, unit: 'g' });
  });

  test('separates a unit still unknown from a row that is not there', async () => {
    const t = convexTest(schema, modules);
    await seedEmptied(t, [{ ean: '1' }]);

    const result = await t.mutation(internal.backfill.repairNetContent, {
      rows: [
        // An area, which CATALOG_UNITS deliberately cannot express.
        {
          ean: '1',
          store: 'coop',
          packageSize: 1,
          packageSizeUnit: 'kvadratmeter',
        },
        { ean: '404', store: 'coop', packageSize: 1, packageSizeUnit: 'kg' },
        // Right EAN, wrong store: the catalog is keyed on the pair.
        { ean: '1', store: 'ica', packageSize: 1, packageSizeUnit: 'kg' },
      ],
    });
    expect(result).toMatchObject({
      patched: 0,
      stillUnresolved: 1,
      absent: 2,
    });
  });
});

describe('field coverage', () => {
  test('counts each optional field, and an empty array is absent not present', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertClean(ctx, {
        ean: '1',
        name: 'Full',
        store: 'coop',
        brand: 'Santa Maria',
        imageUrl: 'https://example.test/a.jpg',
        netContent: { value: 360, unit: 'g' },
        categoryPath: ['Mat', 'Sås'],
        countryOfOrigin: 'Sverige',
        labels: ['KRAV'],
        food: {
          ingredients: 'Tomat',
          nutrition: { basisQuantity: 100, basisUnit: 'g' },
        },
      });
      await upsertClean(ctx, {
        ean: '2',
        name: 'Bare',
        store: 'coop',
        categoryPath: [],
        labels: [],
      });
      await upsertClean(ctx, {
        ean: '3',
        name: 'Ingredients only',
        store: 'coop',
        food: { ingredients: 'Vatten' },
      });
    });

    const before = Date.now();
    await t.action(internal.backfill.rebuildCounters, { scope: 'catalog' });
    const coverage = await t.run(async (ctx) => await readCoverage(ctx));

    expect(coverage.total).toBe(3);
    expect(coverage.measuredAt).toBeGreaterThanOrEqual(before);

    const counts = Object.fromEntries(
      coverage.fields.map((row) => [row.field, row.count]),
    );
    expect(counts).toMatchObject({
      brand: 1,
      imageUrl: 1,
      netContent: 1,
      countryOfOrigin: 1,
      food: 2,
      foodIngredients: 2,
      foodNutrition: 1,
      // Row 2 carries [] for both. An empty list is no coverage.
      categoryPath: 1,
      labels: 1,
    });
  });

  test('reads as not measured until a recount has run', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertClean(ctx, { ean: '1', name: 'A', store: 'coop' });
    });

    const coverage = await t.run(async (ctx) => await readCoverage(ctx));
    expect(coverage.measuredAt).toBeNull();
  });
});
