/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { COOP_BATCH_SIZE } from './model/ingest';
import { readQueueStats } from './model/queue';

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

describe('the fetch, when it fails', () => {
  async function queueStats(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => await readQueueStats(ctx));
  }

  async function rows(t: ReturnType<typeof convexTest>) {
    return await t.run(
      async (ctx) => await ctx.db.query('ingest_queue').take(50),
    );
  }

  async function pendingChain(t: ReturnType<typeof convexTest>) {
    return await t.run(
      async (ctx) => await ctx.db.system.query('_scheduled_functions').take(10),
    );
  }

  test('one bad response fails every row in the batch, with the same error', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000000', '7300000000001', '7300000000002'].map((ean) => ({
        ean,
      })),
      source: 'census',
    });

    // Accepted, not a defect. A 403 is a statement about the caller, not about
    // any one row, so degrading to per-row retry would turn one refused
    // request into as many as the batch is wide, against the very limit that
    // refused it.
    //
    // Note what the run does NOT do: the catch is inside the body, so the run
    // settles `ok` with a summary carrying the failures. A run in which every
    // single row failed is not an errored run, and anything watching only
    // `status: 'error'` will not see this at all.
    const summary = await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 1,
    });
    expect(summary).toMatchObject({ claimed: 3, added: 0, failed: 3 });

    const runs = await t.run(
      async (ctx) => await ctx.db.query('ingest_runs').order('desc').take(5),
    );
    expect(runs[0]!.status).toBe('ok');

    // Back in the lane they came from, carrying why. No button in between.
    const failed = await rows(t);
    expect(failed).toHaveLength(3);
    expect(failed.every((row) => row.status === 'pending')).toBe(true);
    expect(new Set(failed.map((row) => row.lastError)).size).toBe(1);
    expect(failed[0]!.lastError).toMatch(/403/);
    expect(await queueStats(t)).toMatchObject({ pending: 3, processing: 0 });
  });

  /** The guard that makes retry-on-next-run safe. Every row is back in
   * `pending`, so a chain that carried on would re-claim the same barcodes and
   * put the same request back to the API that just refused it. The correct
   * answer to a throttle is fewer requests. */
  test('a thrown batch stops the chain instead of re-claiming the same rows', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000000'].map((ean) => ({ ean })),
      source: 'census',
    });

    // A full batch would normally reschedule: the claim returned exactly the
    // limit and there are batches left.
    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 5,
      batchSize: 1,
    });
    expect(await pendingChain(t)).toEqual([]);
  });

  test('a batch that merely fails per row keeps the chain going', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    // The request succeeds; the row is simply not in the response, which is a
    // skip rather than a thrown fetch.
    respondWith(itemsBody([]));
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000000'].map((ean) => ({ ean })),
      source: 'census',
    });

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 5,
      batchSize: 1,
    });
    expect(await pendingChain(t)).toHaveLength(1);
  });

  test('attempts keeps climbing across runs, and nothing caps it', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith({}, { status: 403 });
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000000'].map((ean) => ({ ean })),
      source: 'census',
    });

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 1,
    });
    expect(await queueStats(t)).toMatchObject({ pending: 1 });

    // Straight back in with no requeue step, which is the point.
    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 1,
    });

    // Nothing caps this. The row retries on every run until it succeeds or
    // someone removes it, and a dead-letter state is a milestone 5 blocker
    // rather than a wart. See DECISIONS.md.
    const [row] = await rows(t);
    expect(row!.attempts).toBe(2);
    expect(row!.status).toBe('pending');
  });
});

describe('the fetch, when a product is missing', () => {
  test('a stored EAN leaves the queue and an unstocked one stays as the memo', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('COOP_EXTERNAL_API_KEY', 'test-key');
    respondWith(itemsBody([{ ean: '7300000000000', name: 'Mjölk' }]));
    await t.mutation(internal.ingest.enqueueEans, {
      store: 'coop',
      rows: ['7300000000000', '7300000000001'].map((ean) => ({ ean })),
      source: 'census',
    });

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'coop',
      batches: 1,
    });

    // Skipped is the one terminal state, so an item that was merely out of
    // stock is never looked at again. Correct while nothing re-fetches at all;
    // it needs a re-check policy the day a refresh path exists. See
    // DECISIONS.md.
    const left = await t.run(
      async (ctx) => await ctx.db.query('ingest_queue').take(50),
    );
    expect(left).toHaveLength(1);
    expect(left[0]!.ean).toBe('7300000000001');
    expect(left[0]!.status).toBe('skipped');
    expect(left[0]!.lastError).toBe('not stocked by Coop');
  });
});
