import type { StoreSlug } from '@matvis/shared';
import { v, type Infer } from 'convex/values';
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import { sanitizeCoopProduct } from './coop/sanitize';
import type { IcaFetchedPage } from './ica/fetch';
import { storeValidator } from './model/fields';
import {
  COOP_BATCH_SIZE,
  DEFAULT_RUN_BATCHES,
  FILL_PAGE_SIZE,
  QUEUE_MAINTENANCE_LIMIT,
  STALE_CLAIM_MS,
  batchSizeFor,
  errorText,
  fetchOutcomeValidator,
} from './model/ingest';
import {
  deleteQueueRow,
  queueEanIfMissing,
  readFillCursor,
  setQueueStatus,
  writeFillCursor,
} from './model/queue';
import { rememberEan } from './model/project';
import { loggedRun } from './model/runs';

const claimedRowValidator = v.object({
  id: v.id('ingest_queue'),
  ean: v.string(),
  sourceId: v.optional(v.string()),
});

const fetchResultValidator = v.object({
  id: v.id('ingest_queue'),
  outcome: fetchOutcomeValidator,
  error: v.optional(v.string()),
});

type ClaimedRow = Infer<typeof claimedRowValidator>;
type FetchResult = Infer<typeof fetchResultValidator>;

/** An EAN entering the pipeline, with the store's own product id where the
 * store needs one to address it. */
const enqueueRowValidator = v.object({
  ean: v.string(),
  sourceId: v.optional(v.string()),
});

export const enqueueEans = internalMutation({
  args: {
    store: storeValidator,
    rows: v.array(enqueueRowValidator),
    source: v.string(),
  },
  returns: v.object({
    queued: v.number(),
    known: v.number(),
    duplicate: v.number(),
  }),
  handler: async (ctx, { store, rows, source }) => {
    if (rows.length > COOP_BATCH_SIZE) {
      throw new Error(
        `enqueueEans takes at most ${COOP_BATCH_SIZE} EANs per call, got ${rows.length}`,
      );
    }
    const now = Date.now();
    const seen = new Set<string>();
    const totals = { queued: 0, known: 0, duplicate: 0 };

    for (const row of rows) {
      if (seen.has(row.ean)) {
        totals.duplicate += 1;
        continue;
      }
      seen.add(row.ean);

      await rememberEan(ctx, store, row.ean, row.sourceId);
      totals[
        await queueEanIfMissing(ctx, store, row.ean, source, now, row.sourceId)
      ] += 1;
    }
    return totals;
  },
});

/** Takes rows out of the pending lane and into `processing` in one transaction,
 * so two overlapping chains cannot fetch the same EAN twice.
 *
 * The batch is not pagination. It is the store's request shape: Coop resolves
 * up to 500 barcodes in one call, and claiming them one at a time would answer
 * a single request with 500 against an API that throttles on volume.
 *
 * A `processing` row older than `STALE_CLAIM_MS` belonged to a worker that
 * died, so it goes back to pending first. */
export const claimPendingEans = internalMutation({
  args: { store: storeValidator, limit: v.number() },
  returns: v.array(claimedRowValidator),
  handler: async (ctx, { store, limit }) => {
    const now = Date.now();

    const inFlight = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_status', (q) =>
        q.eq('store', store).eq('status', 'processing'),
      )
      .take(limit);
    for (const row of inFlight) {
      if ((row.claimedAt ?? row.enqueuedAt) <= now - STALE_CLAIM_MS) {
        await setQueueStatus(ctx, row, 'pending', { claimedAt: undefined });
      }
    }

    const pending = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_status', (q) =>
        q.eq('store', store).eq('status', 'pending'),
      )
      .take(limit);

    const claimed: ClaimedRow[] = [];
    for (const row of pending) {
      await setQueueStatus(ctx, row, 'processing', {
        attempts: row.attempts + 1,
        claimedAt: now,
      });
      claimed.push({ id: row._id, ean: row.ean, sourceId: row.sourceId });
    }
    return claimed;
  },
});

/** Where a claimed row ends up, and the only place the queue shrinks on its
 * own.
 *
 * `stored` deletes the row. The catalog row is the record that this EAN was
 * fetched, so keeping a second one that says so is a table that only grows.
 *
 * `failed` returns the row to `pending` with the error and the bumped attempt
 * count still on it. Nobody has to press anything: the next run claims it
 * again. That is the whole reason there is no `failed` status and no requeue
 * button.
 *
 * `skipped` is the one thing that stays put, because it is a memo rather than
 * an outcome. See `queueStatusValidator`. */
export const settleClaimedRows = internalMutation({
  args: { results: v.array(fetchResultValidator) },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const result of results) {
      const row = await ctx.db.get(result.id);
      if (!row) continue;

      if (result.outcome === 'stored') {
        await deleteQueueRow(ctx, row);
        continue;
      }
      await setQueueStatus(
        ctx,
        row,
        result.outcome === 'skipped' ? 'skipped' : 'pending',
        {
          processedAt: now,
          lastError: result.error,
          claimedAt: undefined,
        },
      );
    }
    return null;
  },
});

/** The escape hatch for a barcode that fails forever. Failures return
 * themselves to the queue, so this is the only thing that takes one out of it.
 *
 * Bounded by the maintenance limit. The console promises this clears every row
 * for the EAN, and at 1000 that promise holds.
 *
 * Per store, because the same barcode legitimately sits in two lanes at once:
 * about a third of the Coop and ICA ranges overlap. */
export const removeQueueRows = internalMutation({
  args: { store: storeValidator, ean: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { store, ean }) => {
    const rows = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_ean', (q) => q.eq('store', store).eq('ean', ean))
      .take(QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) await deleteQueueRow(ctx, row);
    return { deleted: rows.length };
  },
});

type FetchTotals = {
  claimed: number;
  added: number;
  skipped: number;
  failed: number;
};

const NO_FETCH_WORK: FetchTotals = {
  claimed: 0,
  added: 0,
  skipped: 0,
  failed: 0,
};

/** What one lane does with a claimed batch. Every chain resolves EANs its own
 * way, so the shared fetch owns claiming, counting, settling and rescheduling,
 * and the lane owns only "turn these rows into catalog writes". */
type Lane = (ctx: ActionCtx, claimed: ClaimedRow[]) => Promise<FetchResult[]>;

/** One request for the whole batch, which is what makes Coop cheap. An EAN the
 * response omits is not stocked, not an error. */
const fetchCoop: Lane = async (ctx, claimed) => {
  const results: FetchResult[] = [];
  const items: Record<string, unknown>[] = await ctx.runAction(
    internal.coop.fetch.fetchByEan,
    { eans: claimed.map((row) => row.ean) },
  );
  const byEan = new Map(items.map((item) => [item.ean as string, item]));

  for (const row of claimed) {
    const item = byEan.get(row.ean);
    if (!item) {
      results.push({
        id: row.id,
        outcome: 'skipped',
        error: 'not stocked by Coop',
      });
      continue;
    }
    try {
      // The writer's answer, not just the absence of a throw. `project` returns
      // null for a payload with no name, which sanitizing does not guarantee,
      // and reporting that as `stored` deleted the queue row for a catalog row
      // that was never written, so the fill sweep queued it again every pass.
      const { stored } = await ctx.runMutation(
        internal.products.upsertCoopByEan,
        { data: sanitizeCoopProduct(item) },
      );
      results.push(
        stored
          ? { id: row.id, outcome: 'stored' }
          : {
              id: row.id,
              outcome: 'skipped',
              // Deliberately not `not stocked by Coop`. Coop did return an
              // item; it was unusable. The console shows this text.
              error: 'Coop item projected to nothing (no name)',
            },
      );
    } catch (error) {
      results.push({ id: row.id, outcome: 'failed', error: errorText(error) });
    }
  }
  return results;
};

/** One page per product, so the batch is a fan-out rather than one request.
 *
 * A row with no `sourceId` is skipped rather than failed: an ICA page is
 * addressed by product id and an EAN alone cannot reach one, so retrying would
 * never succeed. That only happens to a barcode enqueued by hand without an id,
 * because the census supplies one for every row it loads.
 *
 * A page that answered badly fails only its own row. Coop's rule that one bad
 * response fails the whole batch is reasoned from Coop's shape, where the batch
 * is a single request and a refusal is about the caller; here the batch is 25
 * requests and a 500 is about one page. Only the statuses that really are about
 * the caller — 401, 403, 429 — still throw out of `fetchByProductId` and take
 * the batch and the chain with them. */
const fetchIca: Lane = async (ctx, claimed) => {
  const results: FetchResult[] = [];
  const addressable = claimed.filter((row) => row.sourceId !== undefined);

  for (const row of claimed) {
    if (row.sourceId === undefined) {
      results.push({
        id: row.id,
        outcome: 'skipped',
        error: 'no ICA product id for this EAN',
      });
    }
  }
  if (addressable.length === 0) return results;

  const fetched: IcaFetchedPage[] = await ctx.runAction(
    internal.ica.fetch.fetchByProductId,
    { sourceIds: addressable.map((row) => row.sourceId!) },
  );
  // The whole entry, not just the product: mapping to `one.product` here threw
  // the error away before the lane could tell "no page" from "page did not
  // answer".
  const byId = new Map(fetched.map((one) => [one.sourceId, one]));

  for (const row of addressable) {
    const entry = byId.get(row.sourceId!);
    // `failed` rather than `skipped`, so the row returns to `pending` and the
    // next run retries it: a 500 or a timeout is usually transient. A page that
    // is permanently broken retries forever, which is the uncapped `attempts`
    // question and is acceptable only because the failure now costs one row
    // instead of the lane.
    if (entry === undefined || entry.error !== undefined) {
      results.push({
        id: row.id,
        outcome: 'failed',
        error: entry?.error ?? 'ICA returned no result for this product id',
      });
      continue;
    }
    if (entry.product === null) {
      results.push({
        id: row.id,
        outcome: 'skipped',
        error: 'no public ICA page for this product',
      });
      continue;
    }
    try {
      // `sourceId` rides along so `rememberEan` records the parsed EAN as
      // addressable. Without it an ICA row has no way back to the page it came
      // from, and ICA pages are reachable only by product id.
      const { stored } = await ctx.runMutation(
        internal.products.upsertIcaByEan,
        { data: entry.product, sourceId: row.sourceId },
      );
      if (!stored) {
        results.push({
          id: row.id,
          outcome: 'skipped',
          error: 'ICA page projected to nothing (no ean or no name)',
        });
        continue;
      }
      // The page is the authority on which barcode it describes, so the write
      // above went under the parsed EAN. That leaves the claimed EAN with no
      // catalog row, and settling it `stored` would have the fill sweep queue
      // it again on every pass to fetch the same page forever. `skipped` is
      // terminal and says why. Settling a row `skipped` after a successful
      // write exists nowhere else in the lane: the two are otherwise mutually
      // exclusive, and this is the one case where both are true.
      //
      // Measured at zero over all 34 437 census pages, so this is defensive.
      if (entry.product.ean !== row.ean) {
        results.push({
          id: row.id,
          outcome: 'skipped',
          error: `ICA page ${row.sourceId} resolves to EAN ${entry.product.ean}`,
        });
        continue;
      }
      results.push({ id: row.id, outcome: 'stored' });
    } catch (error) {
      results.push({ id: row.id, outcome: 'failed', error: errorText(error) });
    }
  }
  return results;
};

const LANES: Partial<Record<StoreSlug, Lane>> = {
  coop: fetchCoop,
  ica: fetchIca,
};

async function fetchOneBatch(
  ctx: ActionCtx,
  store: StoreSlug,
  batches: number | undefined,
  batchSize: number | undefined,
): Promise<FetchTotals> {
  const lane = LANES[store];
  if (!lane) throw new Error(`no ingest lane for ${store}`);

  const ceiling = batchSizeFor(store);
  const limit = Math.min(batchSize ?? ceiling, ceiling);
  const claimed: ClaimedRow[] = await ctx.runMutation(
    internal.ingest.claimPendingEans,
    { store, limit },
  );
  if (claimed.length === 0) return { ...NO_FETCH_WORK };

  // One thrown fetch fails the whole claimed batch rather than losing it, and
  // then stops the chain. Every row is already back in `pending`, so carrying
  // on would re-claim the same barcodes and put the same request back to the
  // API that just refused it. The correct answer to a throttle is fewer
  // requests, so the retry waits for the next run.
  let results: FetchResult[];
  let laneThrew = false;
  try {
    results = await lane(ctx, claimed);
  } catch (error) {
    laneThrew = true;
    results = claimed.map((row) => ({
      id: row.id,
      outcome: 'failed' as const,
      error: errorText(error),
    }));
  }

  await ctx.runMutation(internal.ingest.settleClaimedRows, { results });

  const remaining = (batches ?? DEFAULT_RUN_BATCHES) - 1;
  if (!laneThrew && remaining > 0 && claimed.length === limit) {
    await ctx.scheduler.runAfter(0, internal.ingest.fetchQueuedEans, {
      store,
      batches: remaining,
      batchSize,
    });
  }

  const tally = (outcome: FetchResult['outcome']) =>
    results.filter((result) => result.outcome === outcome).length;

  return {
    claimed: claimed.length,
    added: tally('stored'),
    skipped: tally('skipped'),
    failed: tally('failed'),
  };
}

export const fetchQueuedEans = internalAction({
  args: {
    store: storeValidator,
    batches: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    claimed: v.number(),
    added: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, { store, batches, batchSize }): Promise<FetchTotals> =>
    await loggedRun(ctx, 'drain', NO_FETCH_WORK, () =>
      fetchOneBatch(ctx, store, batches, batchSize),
    ),
});

/** One page of the worklist: every EAN `catalog` has no row for gets a queue
 * row. The cursor is persisted, so successive runs continue the pass instead
 * of rescanning from the top. */
export const queueMissingPage = internalMutation({
  args: { store: storeValidator, pageSize: v.optional(v.number()) },
  returns: v.object({
    scanned: v.number(),
    queued: v.number(),
    wrapped: v.boolean(),
  }),
  handler: async (ctx, { store, pageSize }) => {
    const numItems = Math.min(pageSize ?? FILL_PAGE_SIZE, FILL_PAGE_SIZE);
    const cursor = await readFillCursor(ctx, store);
    const page = await ctx.db
      .query('eans')
      .withIndex('by_store_ean', (q) => q.eq('store', store))
      .paginate({ cursor, numItems });

    const now = Date.now();
    let queued = 0;
    for (const row of page.page) {
      const outcome = await queueEanIfMissing(
        ctx,
        store,
        row.ean,
        'fill',
        now,
        row.sourceId,
      );
      if (outcome === 'queued') queued += 1;
    }

    await writeFillCursor(ctx, store, page.isDone ? null : page.continueCursor);
    return { scanned: page.page.length, queued, wrapped: page.isDone };
  },
});

type QueueTotals = { scanned: number; queued: number; passes: number };

const NO_QUEUE_WORK: QueueTotals = { scanned: 0, queued: 0, passes: 0 };

/** The first half of a run: walk the known EANs, queue what the catalog is
 * missing, then hand over to the fetch.
 *
 * The hand-over is unconditional rather than "only if this queued something".
 * A manual paste and a returned failure both leave pending rows this sweep
 * never touched, and a sweep that queued nothing is exactly the case where the
 * queue most likely already holds the work. */
export const queueMissingEans = internalAction({
  args: {
    store: storeValidator,
    batches: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    queued: v.number(),
    passes: v.number(),
  }),
  handler: async (ctx, { store, batches, pageSize }): Promise<QueueTotals> =>
    await loggedRun(ctx, 'fill', NO_QUEUE_WORK, async (paused) => {
      const rounds = Math.max(batches ?? DEFAULT_RUN_BATCHES, 1);
      const totals: QueueTotals = { scanned: 0, queued: 0, passes: 0 };
      let stopped = false;
      for (let i = 0; i < rounds; i += 1) {
        // Every round after the first re-reads pause. A fetch gets this for
        // free because each of its batches is a fresh run; this loop is inside
        // one, so without the probe a long sweep could not be stopped at all.
        if (i > 0 && (await paused())) {
          stopped = true;
          break;
        }
        const page: {
          scanned: number;
          queued: number;
          wrapped: boolean;
        } = await ctx.runMutation(internal.ingest.queueMissingPage, {
          store,
          pageSize,
        });
        totals.scanned += page.scanned;
        totals.queued += page.queued;
        if (page.wrapped) {
          totals.passes += 1;
          break;
        }
      }
      if (!stopped) {
        await ctx.scheduler.runAfter(0, internal.ingest.fetchQueuedEans, {
          store,
          batches,
        });
      }
      return totals;
    }),
});
