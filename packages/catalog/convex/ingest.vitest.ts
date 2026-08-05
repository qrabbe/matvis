/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { COOP_BATCH_SIZE, STALE_CLAIM_MS } from './model/ingest';

const modules = import.meta.glob('./**/*.ts');

/** Every queue row, oldest first. The suite never seeds more than a handful. */
async function queueRows(
  t: ReturnType<typeof convexTest>,
): Promise<Doc<'coop_ingest_queue'>[]> {
  return await t.run(
    async (ctx) => await ctx.db.query('coop_ingest_queue').take(50),
  );
}

/** Enqueue `count` EAN rows through the real mutation, so the counters move. */
async function enqueueEans(t: ReturnType<typeof convexTest>, count: number) {
  return await t.mutation(internal.ingest.enqueueEans, {
    eans: Array.from({ length: count }, (_, n) => `730000000000${n}`),
    source: 'sitemap',
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
    // Every row is pending and counted, which is what the console reads.
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      pending: 3,
    });

    // A second discovery run finds the same EANs and adds nothing.
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
      await ctx.db.insert('raw_coop', { ean: '7300000000000', name: 'Mjölk' });
    });
    const result = await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001', '7300000000001'],
      source: 'sitemap',
    });
    // The known one belongs to the refresh sweep, not to the queue.
    expect(result).toEqual({ queued: 1, known: 1, duplicate: 1 });
  });

  test('refuses a batch above the Coop batch size', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.ingest.enqueueEans, {
        eans: Array.from({ length: COOP_BATCH_SIZE + 1 }, (_, n) => `ean-${n}`),
        source: 'sitemap',
      }),
    ).rejects.toThrow(/at most 500 EANs per call/);
    expect(await queueRows(t)).toEqual([]);
  });

  test('a name row dedupes on its trimmed text and rejects empty text', async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.mutation(internal.ingest.enqueueName, { query: ' Mjölk 3% ' }),
    ).toEqual({ status: 'queued' });
    expect(
      await t.mutation(internal.ingest.enqueueName, { query: 'Mjölk 3%' }),
    ).toEqual({ status: 'duplicate' });
    await expect(
      t.mutation(internal.ingest.enqueueName, { query: '   ' }),
    ).rejects.toThrow(/empty query text/);

    const [row] = await queueRows(t);
    expect(row.kind).toBe('name');
    expect(row.query).toBe('Mjölk 3%');
    expect(row.source).toBe('manual');
  });
});

describe('claimBatch', () => {
  test('a claim is exclusive, so a second claimer gets nothing', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);

    const first = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    expect(first).toHaveLength(2);
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
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
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
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

    // Still in flight: the next claimer must not steal it.
    expect(await t.mutation(internal.ingest.claimBatch, { limit: 10 })).toEqual(
      [],
    );

    // Age the claim past the timeout, as a worker killed by the wall clock
    // would leave it.
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
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      pending: 0,
      processing: 1,
    });
  });

  test('EAN rows are served before name rows', async () => {
    const t = convexTest(schema, modules);
    // Names first, so a claim that ignored `by_status_kind` would return them
    // first too.
    await t.mutation(internal.ingest.enqueueName, { query: 'mjölk' });
    await t.mutation(internal.ingest.enqueueName, { query: 'smör' });
    await enqueueEans(t, 2);

    const first = await t.mutation(internal.ingest.claimBatch, { limit: 2 });
    expect(first.map((row) => row.kind)).toEqual(['ean', 'ean']);

    const second = await t.mutation(internal.ingest.claimBatch, { limit: 2 });
    expect(second.map((row) => row.query)).toEqual(['mjölk', 'smör']);
  });

  test('a short claim tops up with name rows in the same batch', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 1);
    await t.mutation(internal.ingest.enqueueName, { query: 'mjölk' });

    const claimed = await t.mutation(internal.ingest.claimBatch, { limit: 5 });
    expect(claimed.map((row) => row.kind)).toEqual(['ean', 'name']);
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
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      done: 0,
      skipped: 1,
    });
  });

  test('removeQueueRows drops rows by EAN, and needs something to match on', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 2);

    expect(
      await t.mutation(internal.ingest.removeQueueRows, {
        ean: '7300000000000',
      }),
    ).toEqual({ deleted: 1 });
    expect(await queueRows(t)).toHaveLength(1);
    expect(await t.query(internal.ingest.queueStats, {})).toMatchObject({
      pending: 1,
    });

    await expect(
      t.mutation(internal.ingest.removeQueueRows, {}),
    ).rejects.toThrow(/needs an ean or a query/);
  });

  test('listQueueRows pages one status, newest first', async () => {
    const t = convexTest(schema, modules);
    await enqueueEans(t, 3);
    const claimed = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    await t.mutation(internal.ingest.markResults, {
      results: claimed.map((row) => ({
        id: row.id,
        status: 'failed' as const,
        error: `no luck for ${row.ean}`,
      })),
    });

    const page = await t.query(internal.ingest.listQueueRows, {
      status: 'failed',
      numItems: 2,
    });
    expect(page.rows).toHaveLength(2);
    expect(page.isDone).toBe(false);
    expect(page.rows[0].lastError).toMatch(/^no luck for /);
    // Newest first, so the last row enqueued leads the page.
    expect(page.rows[0].ean).toBe('7300000000002');

    const rest = await t.query(internal.ingest.listQueueRows, {
      status: 'failed',
      cursor: page.continueCursor,
      numItems: 2,
    });
    expect(rest.rows.map((row) => row.ean)).toEqual(['7300000000000']);
    // A pending page is empty rather than a mixed bag.
    const pending = await t.query(internal.ingest.listQueueRows, {
      status: 'pending',
    });
    expect(pending.rows).toEqual([]);
  });
});

describe('claimOldestForRefresh', () => {
  test('takes the stalest rows first and stamps them on claim', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // One never fetched (the snapshot import), one fetched long ago, one
      // fetched a minute ago. `by_lastFetchedAt` sorts a missing field before
      // any number, so the snapshot rows are swept first.
      await ctx.db.insert('raw_coop', { ean: 'never', name: 'A' });
      await ctx.db.insert('raw_coop', {
        ean: 'old',
        name: 'B',
        lastFetchedAt: 1,
      });
      await ctx.db.insert('raw_coop', {
        ean: 'recent',
        name: 'C',
        lastFetchedAt: Date.now() - 60_000,
      });
    });
    await t.action(internal.backfill.rebuildCounters, { scope: 'raw' });

    const claim = await t.mutation(internal.ingest.claimOldestForRefresh, {
      limit: 2,
    });
    expect(claim).toEqual({ eans: ['never', 'old'], claimed: 2 });

    // Stamped on claim, not on result, so the two just claimed sort to the back
    // and the sweep moves on rather than re-picking them.
    const next = await t.mutation(internal.ingest.claimOldestForRefresh, {
      limit: 2,
    });
    expect(next.eans[0]).toBe('recent');

    // The never-fetched counter dropped with the row that stopped being one.
    expect(await t.query(internal.ingest.freshnessStats, {})).toMatchObject({
      neverFetched: 0,
    });
  });
});
