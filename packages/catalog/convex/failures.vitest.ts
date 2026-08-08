/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { COOP_BATCH_SIZE, QUEUE_DEDUP_SCAN } from './model/ingest';
import { readQueueStats } from './model/ops';

const modules = import.meta.glob('./**/*.ts');

/** Every failure path the drain can take, pinned against the code rather than
 * assumed. The written verdict on each is in DECISIONS.md; this file is the
 * half that fails the build when the behaviour moves.
 *
 * Everything here is offline. Reproducing a real 403 against the live API is
 * deliberately not done here - a test that calls Coop is a test that hits the
 * rate limit that caused the bug. */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

function respondWith(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const stub = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        statusText: status === 403 ? 'Forbidden' : 'OK',
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

function itemsBody(items: unknown) {
  return { results: { items } };
}

describe('fetchByEan', () => {
  test('a throttle arrives as 403, not 429, and surfaces the status', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });

    // Coop refuses over a rolling window with 403. Nothing here retries or
    // backs off: under manual operation the operator is the backoff, which is
    // a milestone 5 blocker rather than a defect today.
    await expect(
      t.action(internal.coop.fetch.fetchByEan, { eans: ['7300000000000'] }),
    ).rejects.toThrow(/403/);
  });

  test('a missing api key fails the run, not the push', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', '');
    respondWith(itemsBody([]));

    // Read lazily inside the handler on purpose: a top-level throw would fail
    // the deploy of every function in the deployment.
    await expect(
      t.action(internal.coop.fetch.fetchByEan, { eans: ['7300000000000'] }),
    ).rejects.toThrow(/COOP_EXTERNAL_API_KEY/);
  });

  test('a shape change throws rather than being read as no results', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith(itemsBody({ unexpected: 'object' }));

    await expect(
      t.action(internal.coop.fetch.fetchByEan, { eans: ['7300000000000'] }),
    ).rejects.toThrow(/non-array/);
  });

  test('an absent items key is no results, which is a different thing', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({ results: {} });

    expect(
      await t.action(internal.coop.fetch.fetchByEan, {
        eans: ['7300000000000'],
      }),
    ).toEqual([]);
  });

  test('items without a string ean are dropped, not passed on', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith(
      itemsBody([
        { ean: '7300000000000', name: 'Mjölk' },
        { ean: 7300000000001, name: 'Numeric ean' },
        { name: 'No ean at all' },
        null,
      ]),
    );

    const items = await t.action(internal.coop.fetch.fetchByEan, {
      eans: ['7300000000000'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ean: '7300000000000' });
  });

  test('an empty list costs no request at all', async () => {
    const t = convexTest(schema, modules);
    const stub = respondWith(itemsBody([]));

    expect(
      await t.action(internal.coop.fetch.fetchByEan, { eans: [] }),
    ).toEqual([]);
    expect(stub).not.toHaveBeenCalled();
  });

  test('an oversized batch is refused before it is sent', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    const stub = respondWith(itemsBody([]));

    await expect(
      t.action(internal.coop.fetch.fetchByEan, {
        eans: Array.from({ length: COOP_BATCH_SIZE + 1 }, (_, n) => `${n}`),
      }),
    ).rejects.toThrow(/at most/);
    expect(stub).not.toHaveBeenCalled();
  });
});

describe('the drain, when the fetch fails', () => {
  async function queueStats(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => await readQueueStats(ctx));
  }

  async function rows(t: ReturnType<typeof convexTest>) {
    return await t.run(
      async (ctx) => await ctx.db.query('coop_ingest_queue').take(50),
    );
  }

  test('one bad response fails every row in the batch, with the same error', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001', '7300000000002'],
      source: 'census',
    });

    // Accepted, not a defect. A 403 is a statement about the caller, not about
    // any one row, so degrading to per-row retry would turn one refused
    // request into as many as the batch is wide, against the very limit that
    // refused it. The rows are recoverable with one Requeue failed press.
    //
    // Note what the run does NOT do: the catch is inside the body, so the run
    // settles `ok` with a summary carrying the failures. A run in which every
    // single row failed is not an errored run, and anything watching only
    // `status: 'error'` will not see this at all.
    const summary = await t.action(internal.ingest.processQueue, {
      batches: 1,
    });
    expect(summary).toMatchObject({ claimed: 3, added: 0, failed: 3 });

    const runs = await t.run(
      async (ctx) => await ctx.db.query('ingest_runs').order('desc').take(5),
    );
    expect(runs[0]!.status).toBe('ok');

    const failed = await rows(t);
    expect(failed).toHaveLength(3);
    expect(failed.every((row) => row.status === 'failed')).toBe(true);
    expect(new Set(failed.map((row) => row.lastError)).size).toBe(1);
    expect(failed[0]!.lastError).toMatch(/403/);
  });

  test('a failed batch is fully recoverable, and attempts keeps climbing', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000'],
      source: 'census',
    });

    await t.action(internal.ingest.processQueue, { batches: 1 });
    expect(await queueStats(t)).toMatchObject({ failed: 1 });

    expect(await t.mutation(internal.ingest.requeueFailed, {})).toEqual({
      requeued: 1,
    });
    expect(await queueStats(t)).toMatchObject({ pending: 1, failed: 0 });

    await t.action(internal.ingest.processQueue, { batches: 1 });

    // Nothing caps this. Under manual operation the human pressing Requeue is
    // the cap; the moment anything is scheduled, an uncapped retry against a
    // third party is a blocker rather than a wart.
    const [row] = await rows(t);
    expect(row!.attempts).toBe(2);
    expect(row!.status).toBe('failed');
  });
});

describe('the drain, when a product is missing', () => {
  test('an EAN Coop does not stock is skipped, and requeue does not touch it', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith(itemsBody([{ ean: '7300000000000', name: 'Mjölk' }]));
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001'],
      source: 'census',
    });

    await t.action(internal.ingest.processQueue, { batches: 1 });

    const byEan = new Map(
      (
        await t.run(
          async (ctx) => await ctx.db.query('coop_ingest_queue').take(50),
        )
      ).map((row) => [row.ean, row]),
    );
    expect(byEan.get('7300000000000')!.status).toBe('done');
    expect(byEan.get('7300000000001')!.status).toBe('skipped');
    expect(byEan.get('7300000000001')!.lastError).toBe('not stocked by Coop');

    // Skipped is terminal and `requeueFailed` only reaches `failed`, so an
    // item that was merely out of stock is never looked at again. Correct
    // while nothing re-fetches at all; it needs a re-check policy the day a
    // refresh path exists. See DECISIONS.md.
    expect(await t.mutation(internal.ingest.requeueFailed, {})).toEqual({
      requeued: 0,
    });
    expect(
      (
        await t.run(
          async (ctx) => await ctx.db.query('coop_ingest_queue').take(50),
        )
      ).find((row) => row.ean === '7300000000001')!.status,
    ).toBe('skipped');
  });

  test('the dedup lookahead is what bounds a re-queue, not the removal path', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000'],
      source: 'census',
    });
    // Pinned because `removeQueueRows` used to share this constant and
    // promised completeness it could not deliver above eight rows.
    expect(QUEUE_DEDUP_SCAN).toBe(8);
  });
});
