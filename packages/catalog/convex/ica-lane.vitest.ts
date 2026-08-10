/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { v } from 'convex/values';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import schema from './schema';
import { icaProductValidator } from './ica/parse';
import { projectIcaProduct, rememberEan, upsertClean } from './model/project';

const modules = import.meta.glob('./**/*.ts');

/** What the ICA lane does with a batch it cannot fetch cleanly, pinned against
 * the code rather than assumed. `failures.vitest.ts` is the Coop half of this
 * and the two are deliberately not merged: the lanes disagree about what one
 * bad response means, and that disagreement is the thing worth holding still.
 *
 * The stub is `globalThis.fetch`, not `fetchByProductId`. Everything asserted
 * below - the 404 arm, the caller-wide status split, the per-page catch - lives
 * inside that action, and stubbing it would assert nothing about any of them.
 *
 * Everything here is offline. A test that crawls ICA is a test that earns the
 * WAF challenge it is testing. */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

const EAN_A = '7300000000001';
const EAN_B = '7300000000002';
const EAN_C = '7300000000003';

const PRODUCT_A = '2009661';
const PRODUCT_B = '2009662';
const PRODUCT_C = '2009663';

const STATUS_TEXT: Record<number, string> = {
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
};

/** Minimal because a full page fixture rots and hides what the case is about.
 * A `sku` and a `name` are what `parseIcaProduct` refuses a page without. */
function productPage(sku: string, name: string): string {
  return `<html><head><meta itemprop="sku" content="${sku}"><meta itemprop="name" content="${name}"></head><body></body></html>`;
}

/** A stub that answers per product id rather than identically, because an ICA
 * batch is 25 requests and every interesting case mixes a stored page with a
 * failed one. An id the map does not carry answers 404, which is what ICA does
 * with an id that no longer resolves. */
function routeIca(pages: Record<string, string | number>) {
  const stub = vi.fn(async (input: unknown) => {
    const url = String(input);
    const sourceId = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
    const answer = pages[sourceId] ?? 404;
    if (typeof answer === 'number') {
      return new Response('', {
        status: answer,
        statusText: STATUS_TEXT[answer] ?? 'Error',
      });
    }
    return new Response(answer, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/html' },
    });
  });
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

/** ICA's writer with one barcode wired to throw. No page payload makes the real
 * `upsertIcaByEan` throw, and the arm being pinned is the per-row catch in
 * `fetchIca`, so the throw is injected at the module the lane calls rather than
 * imitated further down. Every other row goes through the same projection and
 * write helpers the real writer uses, so it is stored for real. */
const modulesWithFailingWrite = {
  ...modules,
  './products.ts': async () => ({
    ...((await modules['./products.ts']!()) as object),
    upsertIcaByEan: internalMutation({
      args: { data: icaProductValidator, sourceId: v.optional(v.string()) },
      returns: v.object({ stored: v.boolean(), inserted: v.boolean() }),
      handler: async (ctx, { data, sourceId }) => {
        if (data.ean === EAN_B) throw new Error('catalog write failed');
        const clean = projectIcaProduct(data);
        if (!clean) return { stored: false, inserted: false };
        await rememberEan(ctx, 'ica', clean.ean, sourceId);
        return { stored: true, inserted: await upsertClean(ctx, clean) };
      },
    }),
  }),
};

type Harness = ReturnType<typeof convexTest>;

async function enqueue(
  t: Harness,
  rows: { ean: string; sourceId?: string }[],
): Promise<void> {
  await t.mutation(internal.ingest.enqueueEans, {
    store: 'ica',
    rows,
    source: 'census',
  });
}

async function rows(t: Harness) {
  return await t.run(
    async (ctx) => await ctx.db.query('ingest_queue').take(50),
  );
}

async function catalogRows(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('catalog').take(50));
}

async function eanRows(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('eans').take(50));
}

async function pendingChain(t: Harness) {
  return await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').take(10),
  );
}

describe('the ICA lane, when a page fails', () => {
  test('a row with no product id is skipped, and costs no request', async () => {
    const t = convexTest(schema, modules);
    const stub = routeIca({});
    await enqueue(t, [{ ean: EAN_A }]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
    });

    // Accepted, not a defect. An ICA page is addressed by product id and an EAN
    // alone cannot reach one, so a retry could never succeed and `skipped` is
    // the honest terminal state. Only a hand-pasted barcode gets here: the
    // census supplies an id for every row it loads.
    const [row] = await rows(t);
    expect(row).toMatchObject({
      status: 'skipped',
      lastError: 'no ICA product id for this EAN',
    });
    // The claim, in full: it did the right thing without touching the network.
    expect(stub).not.toHaveBeenCalled();
  });

  test('a 404 is a product that is gone, not a failure to retry', async () => {
    const t = convexTest(schema, modules);
    routeIca({});
    await enqueue(t, [{ ean: EAN_A, sourceId: PRODUCT_A }]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
    });

    // Accepted. About 7% of the crawled range answers this way, and it means
    // the id no longer resolves publicly rather than that the fetch went wrong.
    const [row] = await rows(t);
    expect(row).toMatchObject({
      status: 'skipped',
      lastError: 'no public ICA page for this product',
    });
  });

  test('one page that 500s fails its own row and nothing else', async () => {
    const t = convexTest(schema, modules);
    routeIca({
      [PRODUCT_A]: productPage(EAN_A, 'Mjölk'),
      [PRODUCT_B]: 500,
      [PRODUCT_C]: productPage(EAN_C, 'Filmjölk'),
    });
    await enqueue(t, [
      { ean: EAN_A, sourceId: PRODUCT_A },
      { ean: EAN_B, sourceId: PRODUCT_B },
      { ean: EAN_C, sourceId: PRODUCT_C },
    ]);

    const summary = await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 5,
      batchSize: 3,
    });
    expect(summary).toMatchObject({ claimed: 3, added: 2, failed: 1 });

    // The decision Coop does not share. Coop's batch is one request and a
    // refusal is about the caller, so it fails all 500 rows. Here the batch is
    // 25 requests and a 500 is about one page, so taking the other 24 down with
    // it is what kept the lane pinned on the same poison id run after run.
    const left = await rows(t);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ ean: EAN_B, status: 'pending' });
    expect(left[0]!.lastError).toMatch(/500/);
    expect((await catalogRows(t)).map((row) => row.ean).sort()).toEqual([
      EAN_A,
      EAN_C,
    ]);

    // And the chain carries on, because two rows left the lane for good. The
    // next batch sees new work rather than the same three barcodes.
    expect(await pendingChain(t)).toHaveLength(1);
  });

  test('a 403 on one page takes the batch and the chain with it', async () => {
    const t = convexTest(schema, modules);
    routeIca({
      [PRODUCT_A]: productPage(EAN_A, 'Mjölk'),
      [PRODUCT_B]: 403,
      [PRODUCT_C]: productPage(EAN_C, 'Filmjölk'),
    });
    await enqueue(t, [
      { ean: EAN_A, sourceId: PRODUCT_A },
      { ean: EAN_B, sourceId: PRODUCT_B },
      { ean: EAN_C, sourceId: PRODUCT_C },
    ]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 5,
      batchSize: 3,
    });

    // Accepted, and the one place ICA keeps Coop's batch-wide rule: 401, 403
    // and 429 are statements about the caller, so answering one with 24 more
    // requests aims them at the limit that just refused them. Every row goes
    // back to pending carrying the same error, and the write that had already
    // succeeded in the same batch is thrown away with it.
    const left = await rows(t);
    expect(left).toHaveLength(3);
    expect(left.every((row) => row.status === 'pending')).toBe(true);
    expect(new Set(left.map((row) => row.lastError)).size).toBe(1);
    expect(left[0]!.lastError).toMatch(/403/);

    // The guard that makes retry-on-next-run safe. Everything is back in
    // pending, so a chain that carried on would re-claim these three ids and
    // put the refused request straight back.
    expect(await pendingChain(t)).toEqual([]);
  });

  test('a batch where every page failed stops the chain', async () => {
    const t = convexTest(schema, modules);
    routeIca({ [PRODUCT_A]: 500, [PRODUCT_B]: 500, [PRODUCT_C]: 500 });
    await enqueue(t, [
      { ean: EAN_A, sourceId: PRODUCT_A },
      { ean: EAN_B, sourceId: PRODUCT_B },
      { ean: EAN_C, sourceId: PRODUCT_C },
    ]);

    const summary = await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 5,
      batchSize: 3,
    });
    expect(summary).toMatchObject({ claimed: 3, added: 0, failed: 3 });

    // Nothing threw here, so the thrown-batch guard above does not apply. This
    // is the other one: a batch that made no progress returned every row to
    // pending with its original enqueue time, so it is still the oldest work on
    // the index and the next batch would claim the same three ids forever.
    const left = await rows(t);
    expect(left.every((row) => row.status === 'pending')).toBe(true);
    expect(await pendingChain(t)).toEqual([]);
  });

  test('a write that throws fails its row while the others store', async () => {
    const t = convexTest(schema, modulesWithFailingWrite);
    routeIca({
      [PRODUCT_A]: productPage(EAN_A, 'Mjölk'),
      [PRODUCT_B]: productPage(EAN_B, 'Grädde'),
      [PRODUCT_C]: productPage(EAN_C, 'Filmjölk'),
    });
    await enqueue(t, [
      { ean: EAN_A, sourceId: PRODUCT_A },
      { ean: EAN_B, sourceId: PRODUCT_B },
      { ean: EAN_C, sourceId: PRODUCT_C },
    ]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
      batchSize: 3,
    });

    // Existing behaviour, and the reason the write sits inside the per-row try
    // rather than around the loop. The page answered fine, so the failure is
    // about this row alone and it goes back to pending to be retried.
    const left = await rows(t);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ ean: EAN_B, status: 'pending' });
    expect(left[0]!.lastError).toMatch(/catalog write failed/);
    expect((await catalogRows(t)).map((row) => row.ean).sort()).toEqual([
      EAN_A,
      EAN_C,
    ]);
  });
});

describe('the ICA lane, when a page is written', () => {
  test('a stored page leaves the queue and records how to reach it again', async () => {
    const t = convexTest(schema, modules);
    routeIca({ [PRODUCT_A]: productPage(EAN_A, 'Mjölk') });
    await enqueue(t, [{ ean: EAN_A, sourceId: PRODUCT_A }]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
    });

    expect(await rows(t)).toEqual([]);
    expect(await catalogRows(t)).toMatchObject([
      { ean: EAN_A, store: 'ica', name: 'Mjölk' },
    ]);
    // The id has to survive the write. ICA pages are reachable only by product
    // id, so an `eans` row without one can never be re-fetched.
    expect(await eanRows(t)).toMatchObject([
      { ean: EAN_A, store: 'ica', sourceId: PRODUCT_A },
    ]);
  });

  test('a page that states another EAN is trusted, and closes the loop', async () => {
    const t = convexTest(schema, modules);
    // The claimed row says EAN_A at PRODUCT_A. The page says EAN_B.
    routeIca({ [PRODUCT_A]: productPage(EAN_B, 'Mjölk') });
    await enqueue(t, [{ ean: EAN_A, sourceId: PRODUCT_A }]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
    });

    // Decided: the page is the authority on which barcode it describes, so the
    // catalog row goes under the parsed EAN and the parsed EAN is what is
    // recorded as reachable at this product id. Measured at zero over the
    // 34 437 page census, so this is a guard rather than a fix for something
    // observed. See DECISIONS.md.
    expect(await catalogRows(t)).toMatchObject([{ ean: EAN_B, store: 'ica' }]);
    const known = await eanRows(t);
    expect(known.find((row) => row.ean === EAN_B)?.sourceId).toBe(PRODUCT_A);

    // The claimed row is settled skipped after a successful write, which
    // happens nowhere else in the lane. Settling it stored would delete it and
    // leave the catalog with no row for EAN_A at all.
    const left = await rows(t);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      ean: EAN_A,
      status: 'skipped',
      lastError: `ICA page ${PRODUCT_A} resolves to EAN ${EAN_B}`,
    });

    // Which is the half that proves the loop is closed. The memo is what the
    // fill sweep reads as a duplicate: without it the sweep queues EAN_A again
    // on every pass and the lane fetches the same page forever.
    const sweep = await t.mutation(internal.ingest.queueMissingPage, {
      store: 'ica',
    });
    expect(sweep).toMatchObject({ queued: 0 });
    expect(await rows(t)).toHaveLength(1);
  });

  test('two rows on one product id cost one request between them', async () => {
    const t = convexTest(schema, modules);
    const stub = routeIca({ [PRODUCT_A]: productPage(EAN_A, 'Mjölk') });
    // Two `eans` rows legitimately pointing at one ICA product.
    await enqueue(t, [
      { ean: EAN_A, sourceId: PRODUCT_A },
      { ean: EAN_B, sourceId: PRODUCT_A },
    ]);

    await t.action(internal.ingest.fetchQueuedEans, {
      store: 'ica',
      batches: 1,
    });

    // The ids are deduped before the fan-out and the single answer is fanned
    // back out to every row that asked for it, so the second row is settled
    // from the same page rather than costing a second crawl of it.
    expect(stub).toHaveBeenCalledTimes(1);
    const left = await rows(t);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ ean: EAN_B, status: 'skipped' });
    expect(await catalogRows(t)).toMatchObject([{ ean: EAN_A, store: 'ica' }]);
  });
});
