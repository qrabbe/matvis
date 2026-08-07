/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { rememberEan, upsertClean } from './model/project';
import { readQueueStats } from './model/ops';
import { COOP_BATCH_SIZE, STALE_CLAIM_MS } from './model/ingest';

const modules = import.meta.glob('./**/*.ts');

async function queueRows(
  t: ReturnType<typeof convexTest>,
): Promise<Doc<'coop_ingest_queue'>[]> {
  return await t.run(
    async (ctx) => await ctx.db.query('coop_ingest_queue').take(50),
  );
}

async function queueStats(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await readQueueStats(ctx));
}

async function enqueueEans(t: ReturnType<typeof convexTest>, count: number) {
  return await t.mutation(internal.ingest.enqueueEans, {
    eans: Array.from({ length: count }, (_, n) => `730000000000${n}`),
    source: 'census',
  });
}

describe('enqueue', () => {
  test('queues new EANs and refuses to queue them twice', async () => {
    const t = convexTest(schema, modules);
    expect(await enqueueEans(t, 3)).toEqual({
      queued: 3,
      known: 0,
      duplicate: 0,
    });
    expect(await queueStats(t)).toMatchObject({
      pending: 3,
    });

    expect(await enqueueEans(t, 3)).toEqual({
      queued: 0,
      known: 0,
      duplicate: 3,
    });
    expect(await queueRows(t)).toHaveLength(3);
  });

  test('skips an EAN the catalog already has, and duplicates within one call', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertClean(ctx, {
        ean: '7300000000000',
        name: 'Mjölk',
        store: 'coop',
      });
    });
    const result = await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001', '7300000000001'],
      source: 'census',
    });
    expect(result).toEqual({ queued: 1, known: 1, duplicate: 1 });
  });

  test('refuses a batch above the Coop batch size', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.ingest.enqueueEans, {
        eans: Array.from({ length: COOP_BATCH_SIZE + 1 }, (_, n) => `ean-${n}`),
        source: 'census',
      }),
    ).rejects.toThrow(/at most 500 EANs per call/);
    expect(await queueRows(t)).toEqual([]);
  });
});

describe('claimBatch', () => {
  test('a claim is exclusive, so a second claimer gets nothing', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);

    const first = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    expect(first).toHaveLength(2);
    expect(await queueStats(t)).toMatchObject({
      pending: 0,
      processing: 2,
    });

    const second = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    expect(second).toEqual([]);
  });

  test('claiming stamps the attempt and settling releases the row', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 1);
    const [claimed] = await t.mutation(internal.ingest.claimBatch, {
      limit: 10,
    });

    const inFlight = (await queueRows(t))[0];
    expect(inFlight.status).toBe('processing');
    expect(inFlight.attempts).toBe(1);
    expect(inFlight.claimedAt).toBeDefined();

    await t.mutation(internal.ingest.markResults, {
      results: [{ id: claimed.id, status: 'done' }],
    });
    const settled = (await queueRows(t))[0];
    expect(settled.status).toBe('done');
    expect(settled.claimedAt).toBeUndefined();
    expect(settled.processedAt).toBeDefined();
    expect(await queueStats(t)).toMatchObject({
      processing: 0,
      done: 1,
    });
  });

  test('a failure keeps its error and a later success clears it', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 1);
    const [first] = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    await t.mutation(internal.ingest.markResults, {
      results: [{ id: first.id, status: 'failed', error: 'Coop by-id failed' }],
    });
    expect((await queueRows(t))[0].lastError).toBe('Coop by-id failed');

    await t.mutation(internal.ingest.requeueFailed, {});
    const requeued = (await queueRows(t))[0];
    expect(requeued.status).toBe('pending');
    expect(requeued.lastError).toBeUndefined();

    const [second] = await t.mutation(internal.ingest.claimBatch, {
      limit: 10,
    });
    await t.mutation(internal.ingest.markResults, {
      results: [{ id: second.id, status: 'done' }],
    });
    const done = (await queueRows(t))[0];
    expect(done.lastError).toBeUndefined();
    expect(done.attempts).toBe(2);
  });

  test('a claim a dead worker left behind is reclaimed once it goes stale', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 1);
    const [claimed] = await t.mutation(internal.ingest.claimBatch, {
      limit: 10,
    });

    expect(await t.mutation(internal.ingest.claimBatch, { limit: 10 })).toEqual(
      [],
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(claimed.id, {
        claimedAt: Date.now() - STALE_CLAIM_MS - 1,
      });
    });

    const reclaimed = await t.mutation(internal.ingest.claimBatch, {
      limit: 10,
    });
    expect(reclaimed.map((row) => row.id)).toEqual([claimed.id]);
    expect((await queueRows(t))[0].attempts).toBe(2);
    expect(await queueStats(t)).toMatchObject({
      pending: 0,
      processing: 1,
    });
  });

  test('a claim never returns more than its limit', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 5);

    const first = await t.mutation(internal.ingest.claimBatch, { limit: 2 });
    expect(first).toHaveLength(2);
    expect(await queueStats(t)).toMatchObject({ pending: 3, processing: 2 });

    const second = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    expect(second).toHaveLength(3);
  });
});

describe('queue maintenance', () => {
  test('clearDoneRows deletes done rows and leaves skipped ones as the memo', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);
    const claimed = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    await t.mutation(internal.ingest.markResults, {
      results: [
        { id: claimed[0].id, status: 'done' },
        { id: claimed[1].id, status: 'skipped', error: 'not stocked by Coop' },
      ],
    });

    expect(await t.mutation(internal.ingest.clearDoneRows, {})).toEqual({
      deleted: 1,
    });
    const left = await queueRows(t);
    expect(left.map((row) => row.status)).toEqual(['skipped']);
    expect(await queueStats(t)).toMatchObject({
      done: 0,
      skipped: 1,
    });
  });

  test('removeQueueRows drops every row for one EAN', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);

    expect(
      await t.mutation(internal.ingest.removeQueueRows, {
        ean: '7300000000000',
      }),
    ).toEqual({ deleted: 1 });
    expect(await queueRows(t)).toHaveLength(1);
    expect(await queueStats(t)).toMatchObject({
      pending: 1,
    });
  });
});

describe('fillMissing', () => {
  test('queues only the EANs catalog has no row for, and wraps its cursor', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertClean(ctx, { ean: 'held', name: 'A', store: 'coop' });
      for (const ean of ['held', 'gap-one', 'gap-two']) {
        await rememberEan(ctx, 'coop', ean);
      }
    });

    const first = await t.mutation(internal.ingest.fillMissingPage, {});
    expect(first).toEqual({ scanned: 3, queued: 2, wrapped: true });

    const queued = await t.run(async (ctx) =>
      (await ctx.db.query('coop_ingest_queue').collect())
        .map((row) => row.ean)
        .sort(),
    );
    expect(queued).toEqual(['gap-one', 'gap-two']);

    // A second pass finds the same gaps already queued and adds nothing.
    const second = await t.mutation(internal.ingest.fillMissingPage, {});
    expect(second).toMatchObject({ queued: 0, wrapped: true });
  });
});
