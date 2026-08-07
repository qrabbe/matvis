/// <reference types="vite/client" />
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
import { readFillStats, readQueueStats } from './model/ops';
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
      await ctx.db.insert('coop_ingest_queue', {
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
  return await t.run(async (ctx) => await readFillStats(ctx));
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
    const rows = await ctx.db.query('app_counters').take(20);
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

    await t.mutation(internal.ingest.claimBatch, { limit: 1 });
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
