/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { rememberEan, upsertClean } from './model/project';
import { insertQueueRow, readQueueStats, writePaused } from './model/ops';
import {
  COOP_BATCH_SIZE,
  QUEUE_DEDUP_SCAN,
  STALE_CLAIM_MS,
} from './model/ingest';

const modules = import.meta.glob('./**/*.ts');

async function queueRows(
  t: ReturnType<typeof convexTest>,
): Promise<Doc<'ingest_queue'>[]> {
  return await t.run(
    async (ctx) => await ctx.db.query('ingest_queue').take(50),
  );
}

async function queueStats(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await readQueueStats(ctx));
}

async function enqueueEans(t: ReturnType<typeof convexTest>, count: number) {
  return await t.mutation(internal.ingest.enqueueEans, {
    store: 'coop',
    rows: Array.from({ length: count }, (_, n) => `730000000000${n}`).map(
      (ean) => ({ ean }),
    ),
    source: 'census',
  });
}

/** The reason the lane carries a store at all. About a third of the Coop and
 * ICA ranges are the same barcodes, so every check along the way has to be
 * keyed on the pair and not the EAN. Before this, an ICA load answered `known`
 * for all 11 042 shared products and ingested none of them. */
describe('two stores, one barcode', () => {
  const SHARED = '7300000000000';

  test('a barcode Coop already holds is still work for the ICA lane', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertClean(ctx, { ean: SHARED, name: 'Coop row', store: 'coop' });
    });

    // Coop has it, so the Coop lane is done with it.
    expect(
      await t.mutation(internal.ingest.enqueueEans, {
        store: 'coop',
        rows: [{ ean: SHARED }],
        source: 'census',
      }),
    ).toMatchObject({ queued: 0, known: 1 });

    // ICA does not, so the same barcode is still work there.
    expect(
      await t.mutation(internal.ingest.enqueueEans, {
        store: 'ica',
        rows: [{ ean: SHARED, sourceId: '2009660' }],
        source: 'census',
      }),
    ).toMatchObject({ queued: 1, known: 0 });
  });

  test('the two lanes queue, claim and dedup independently', async () => {
    const t = convexTest(schema, modules);
    for (const store of ['coop', 'ica'] as const) {
      await t.mutation(internal.ingest.enqueueEans, {
        store,
        rows: [
          { ean: SHARED, sourceId: store === 'ica' ? '2009660' : undefined },
        ],
        source: 'census',
      });
    }
    expect(await queueRows(t)).toHaveLength(2);

    // Claiming one lane leaves the other untouched, and carries the source id
    // the ICA fetch needs to address the page.
    const ica = await t.mutation(internal.ingest.claimBatch, {
      store: 'ica',
      limit: 10,
    });
    expect(ica).toHaveLength(1);
    expect(ica[0].sourceId).toBe('2009660');

    const coop = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    expect(coop).toHaveLength(1);
    expect(coop[0].sourceId).toBeUndefined();

    // Removal is per lane too, or clearing one chain would empty the other.
    expect(
      await t.mutation(internal.ingest.removeQueueRows, {
        store: 'ica',
        ean: SHARED,
      }),
    ).toEqual({ deleted: 1 });
    expect((await queueRows(t)).map((row) => row.store)).toEqual(['coop']);
  });

  test('the fill sweep walks one store and keeps a cursor per store', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await rememberEan(ctx, 'coop', SHARED);
      await rememberEan(ctx, 'ica', SHARED, '2009660');
      await rememberEan(ctx, 'ica', '7300000000001', '2009661');
    });

    const ica = await t.mutation(internal.ingest.fillMissingPage, {
      store: 'ica',
    });
    expect(ica).toMatchObject({ scanned: 2, queued: 2 });
    expect((await queueRows(t)).every((row) => row.store === 'ica')).toBe(true);

    // The ICA pass wrapping must not move Coop's cursor.
    const coop = await t.mutation(internal.ingest.fillMissingPage, {
      store: 'coop',
    });
    expect(coop).toMatchObject({ scanned: 1, queued: 1 });
  });

  test('rememberEan fills in a source id an earlier pass did not have', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await rememberEan(ctx, 'ica', SHARED);
      await rememberEan(ctx, 'ica', SHARED, '2009660');
      const [row] = await ctx.db
        .query('eans')
        .withIndex('by_store_ean', (q) =>
          q.eq('store', 'ica').eq('ean', SHARED),
        )
        .take(5);
      expect(row!.sourceId).toBe('2009660');
    });
  });
});

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
      store: 'coop',
      rows: ['7300000000000', '7300000000001', '7300000000001'].map((ean) => ({
        ean,
      })),
      source: 'census',
    });
    expect(result).toEqual({ queued: 1, known: 1, duplicate: 1 });
  });

  test('refuses a batch above the Coop batch size', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.ingest.enqueueEans, {
        store: 'coop',
        rows: Array.from(
          { length: COOP_BATCH_SIZE + 1 },
          (_, n) => `ean-${n}`,
        ).map((ean) => ({ ean })),
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

    const first = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    expect(first).toHaveLength(2);
    expect(await queueStats(t)).toMatchObject({
      pending: 0,
      processing: 2,
    });

    const second = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    expect(second).toEqual([]);
  });

  test('claiming stamps the attempt and settling releases the row', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 1);
    const [claimed] = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
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
    const [first] = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    await t.mutation(internal.ingest.markResults, {
      results: [{ id: first.id, status: 'failed', error: 'Coop by-id failed' }],
    });
    expect((await queueRows(t))[0].lastError).toBe('Coop by-id failed');

    await t.mutation(internal.ingest.requeueFailed, { store: 'coop' });
    const requeued = (await queueRows(t))[0];
    expect(requeued.status).toBe('pending');
    expect(requeued.lastError).toBeUndefined();

    const [second] = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
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
      store: 'coop',
      limit: 10,
    });

    expect(
      await t.mutation(internal.ingest.claimBatch, {
        store: 'coop',
        limit: 10,
      }),
    ).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.patch(claimed.id, {
        claimedAt: Date.now() - STALE_CLAIM_MS - 1,
      });
    });

    const reclaimed = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
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

    const first = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 2,
    });
    expect(first).toHaveLength(2);
    expect(await queueStats(t)).toMatchObject({ pending: 3, processing: 2 });

    const second = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    expect(second).toHaveLength(3);
  });
});

describe('queue maintenance', () => {
  test('clearDoneRows deletes done rows and leaves skipped ones as the memo', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);
    const claimed = await t.mutation(internal.ingest.claimBatch, {
      store: 'coop',
      limit: 10,
    });
    await t.mutation(internal.ingest.markResults, {
      results: [
        { id: claimed[0].id, status: 'done' },
        { id: claimed[1].id, status: 'skipped', error: 'not stocked by Coop' },
      ],
    });

    expect(
      await t.mutation(internal.ingest.clearDoneRows, { store: 'coop' }),
    ).toEqual({
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
        store: 'coop',
        ean: '7300000000000',
      }),
    ).toEqual({ deleted: 1 });
    expect(await queueRows(t)).toHaveLength(1);
    expect(await queueStats(t)).toMatchObject({
      pending: 1,
    });
  });

  test('removeQueueRows is not bounded by the dedup lookahead', async () => {
    const t = convexTest(schema, modules);
    const many = QUEUE_DEDUP_SCAN + 4;
    // Straight inserts: `queueEanIfMissing` would dedup these down to one, and
    // the rows this has to cope with are exactly the ones that got past it.
    await t.run(async (ctx) => {
      for (let i = 0; i < many; i += 1) {
        await insertQueueRow(ctx, {
          ean: '7300000000000',
          store: 'coop',
          status: 'failed',
          attempts: 1,
          source: 'census',
          enqueuedAt: Date.now(),
        });
      }
    });

    expect(
      await t.mutation(internal.ingest.removeQueueRows, {
        store: 'coop',
        ean: '7300000000000',
      }),
    ).toEqual({ deleted: many });
    expect(await queueRows(t)).toEqual([]);
    expect(await queueStats(t)).toMatchObject({ failed: 0 });
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

    const first = await t.mutation(internal.ingest.fillMissingPage, {
      store: 'coop',
    });
    expect(first).toEqual({ scanned: 3, queued: 2, wrapped: true });

    const queued = await t.run(async (ctx) =>
      (await ctx.db.query('ingest_queue').collect())
        .map((row) => row.ean)
        .sort(),
    );
    expect(queued).toEqual(['gap-one', 'gap-two']);

    // A second pass finds the same gaps already queued and adds nothing.
    const second = await t.mutation(internal.ingest.fillMissingPage, {
      store: 'coop',
    });
    expect(second).toMatchObject({ queued: 0, wrapped: true });
  });

  test('a fill started while paused scans nothing and logs itself paused', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const ean of ['gap-one', 'gap-two']) {
        await rememberEan(ctx, 'coop', ean);
      }
      await writePaused(ctx, true);
    });

    expect(
      await t.action(internal.ingest.fillMissing, {
        store: 'coop',
        batches: 4,
        pageSize: 1,
      }),
    ).toEqual({ scanned: 0, queued: 0, passes: 0 });
    expect(await queueRows(t)).toEqual([]);

    const runs = await t.run(
      async (ctx) => await ctx.db.query('ingest_runs').order('desc').take(5),
    );
    expect(runs.map((run) => run.status)).toEqual(['paused']);
  });

  test('an unpaused fill runs every round it was given', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const ean of ['a', 'b', 'c', 'd']) {
        await rememberEan(ctx, 'coop', ean);
      }
    });

    // One EAN per page, three rounds: the loop is what decides how far this
    // gets, which is why pause has to be readable from inside it.
    expect(
      await t.action(internal.ingest.fillMissing, {
        store: 'coop',
        batches: 3,
        pageSize: 1,
      }),
    ).toMatchObject({ scanned: 3, queued: 3 });

    const runs = await t.run(
      async (ctx) => await ctx.db.query('ingest_runs').order('desc').take(5),
    );
    expect(runs[0]!.status).toBe('ok');
  });
});
