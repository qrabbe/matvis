/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { NEVER_FETCHED_KEY, queueCountKey } from './model/counters';
import type { QueueStatus } from './model/ingest';

const modules = import.meta.glob('./**/*.ts');

async function seedQueue(
  t: ReturnType<typeof convexTest>,
  rows: { status: QueueStatus; kind?: 'ean' | 'name' }[],
) {
  await t.run(async (ctx) => {
    let n = 0;
    for (const row of rows) {
      n += 1;
      await ctx.db.insert('coop_ingest_queue', {
        kind: row.kind ?? 'ean',
        ean: `730000000000${n}`,
        status: row.status,
        attempts: 0,
        source: 'sitemap',
        enqueuedAt: Date.now(),
      });
    }
  });
}

async function seedRaw(
  t: ReturnType<typeof convexTest>,
  total: number,
  fetched = 0,
) {
  await t.run(async (ctx) => {
    for (let n = 0; n < total; n += 1) {
      await ctx.db.insert('raw_coop', {
        ean: `750000000000${n}`,
        name: `Product ${n}`,
        ...(n < fetched ? { lastFetchedAt: Date.now() } : {}),
      });
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
    await seedRaw(t, 5, 3);

    const result = await t.action(internal.backfill.rebuildCounters, {});
    expect(result.queue).toEqual({
      pending: 3,
      processing: 1,
      done: 2,
      skipped: 0,
      failed: 0,
    });
    expect(result.neverFetched).toBe(2);
    expect(result.pages).toBe(2);

    expect(await t.query(internal.ingest.queueStats, {})).toEqual({
      pending: 3,
      processing: 1,
      done: 2,
      skipped: 0,
      failed: 0,
    });
    expect(await t.query(internal.ingest.freshnessStats, {})).toMatchObject({
      neverFetched: 2,
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
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      pending: -1,
      processing: 1,
    });

    await t.action(internal.backfill.rebuildCounters, { scope: 'queue' });
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
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
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      pending: 1,
      failed: 0,
    });
  });

  test('each scope leaves the other half of the counters alone', async () => {
    const t = convexTest(schema, modules);
    await seedQueue(t, [{ status: 'pending' }, { status: 'pending' }]);
    await seedRaw(t, 1);

    const raw = await t.action(internal.backfill.rebuildCounters, {
      scope: 'raw',
    });
    expect(raw).toEqual({ queue: null, neverFetched: 1, pages: 1 });
    expect(await counters(t)).toEqual({ [NEVER_FETCHED_KEY]: 1 });

    const queue = await t.action(internal.backfill.rebuildCounters, {
      scope: 'queue',
    });
    expect(queue.neverFetched).toBeNull();
    expect(queue.queue).toMatchObject({ pending: 2 });
    expect(await counters(t)).toMatchObject({
      [NEVER_FETCHED_KEY]: 1,
      [queueCountKey('pending')]: 2,
    });

    await t.action(internal.backfill.rebuildCounters, { scope: 'raw' });
    expect(await counters(t)).toMatchObject({
      [NEVER_FETCHED_KEY]: 1,
      [queueCountKey('pending')]: 2,
    });
  });
});
