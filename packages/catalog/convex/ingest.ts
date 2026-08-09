import type { StoreSlug } from '@matvis/shared';
import { v, type Infer } from 'convex/values';
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import { sanitizeCoopProduct } from './coop/sanitize';
import { storeValidator } from './model/fields';
import {
  COOP_BATCH_SIZE,
  DEFAULT_FILL_BATCHES,
  DEFAULT_QUEUE_BATCHES,
  FILL_PAGE_SIZE,
  QUEUE_MAINTENANCE_LIMIT,
  STALE_CLAIM_MS,
  batchSizeFor,
  errorText,
} from './model/ingest';
import {
  deleteQueueRow,
  queueEanIfMissing,
  readFillCursor,
  setQueueStatus,
  setQueueStatusById,
  writeFillCursor,
} from './model/ops';
import { rememberEan } from './model/project';
import { loggedRun } from './model/runs';

const claimedRowValidator = v.object({
  id: v.id('ingest_queue'),
  ean: v.string(),
  sourceId: v.optional(v.string()),
});

const terminalStatusValidator = v.union(
  v.literal('done'),
  v.literal('skipped'),
  v.literal('failed'),
);

const workerResultValidator = v.object({
  id: v.id('ingest_queue'),
  status: terminalStatusValidator,
  error: v.optional(v.string()),
});

type ClaimedRow = Infer<typeof claimedRowValidator>;
type WorkerResult = Infer<typeof workerResultValidator>;

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

export const claimBatch = internalMutation({
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

export const markResults = internalMutation({
  args: { results: v.array(workerResultValidator) },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const result of results) {
      await setQueueStatusById(ctx, result.id, result.status, {
        processedAt: now,
        lastError: result.error,
        claimedAt: undefined,
      });
    }
    return null;
  },
});

export const clearDoneRows = internalMutation({
  args: { store: storeValidator, limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { store, limit }) => {
    const rows = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_status', (q) =>
        q.eq('store', store).eq('status', 'done'),
      )
      .take(limit ?? QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) await deleteQueueRow(ctx, row);
    return { deleted: rows.length };
  },
});

export const requeueFailed = internalMutation({
  args: { store: storeValidator, limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { store, limit }) => {
    const rows = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_status', (q) =>
        q.eq('store', store).eq('status', 'failed'),
      )
      .take(limit ?? QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) {
      await setQueueStatus(ctx, row, 'pending', {
        lastError: undefined,
        processedAt: undefined,
      });
    }
    return { requeued: rows.length };
  },
});

/** Bounded by the maintenance limit rather than `QUEUE_DEDUP_SCAN`, which is a
 * dedup lookahead of 8 and was never a removal bound. The console promises this
 * clears every row for the EAN, and at 1000 that promise holds.
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

type QueueTotals = {
  claimed: number;
  added: number;
  skipped: number;
  failed: number;
};

const NO_QUEUE_WORK: QueueTotals = {
  claimed: 0,
  added: 0,
  skipped: 0,
  failed: 0,
};

/** What one lane does with a claimed batch. Every chain resolves EANs its own
 * way, so the shared drain owns claiming, counting, marking and rescheduling,
 * and the lane owns only "turn these rows into catalog writes". */
type Lane = (ctx: ActionCtx, claimed: ClaimedRow[]) => Promise<WorkerResult[]>;

/** One request for the whole batch, which is what makes Coop cheap. An EAN the
 * response omits is not stocked, not an error. */
const drainCoop: Lane = async (ctx, claimed) => {
  const results: WorkerResult[] = [];
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
        status: 'skipped',
        error: 'not stocked by Coop',
      });
      continue;
    }
    try {
      await ctx.runMutation(internal.products.upsertCoopByEan, {
        data: sanitizeCoopProduct(item),
      });
      results.push({ id: row.id, status: 'done' });
    } catch (error) {
      results.push({ id: row.id, status: 'failed', error: errorText(error) });
    }
  }
  return results;
};

const LANES: Partial<Record<StoreSlug, Lane>> = {
  coop: drainCoop,
};

async function drainOneBatch(
  ctx: ActionCtx,
  store: StoreSlug,
  batches: number | undefined,
  batchSize: number | undefined,
): Promise<QueueTotals> {
  const lane = LANES[store];
  if (!lane) throw new Error(`no ingest lane for ${store}`);

  const ceiling = batchSizeFor(store);
  const limit = Math.min(batchSize ?? ceiling, ceiling);
  const claimed: ClaimedRow[] = await ctx.runMutation(
    internal.ingest.claimBatch,
    { store, limit },
  );
  if (claimed.length === 0) return { ...NO_QUEUE_WORK };

  // One thrown fetch fails the whole claimed batch rather than losing it. The
  // rows go back through `requeueFailed`, which is the decision step 10 pinned.
  let results: WorkerResult[];
  try {
    results = await lane(ctx, claimed);
  } catch (error) {
    results = claimed.map((row) => ({
      id: row.id,
      status: 'failed' as const,
      error: errorText(error),
    }));
  }

  await ctx.runMutation(internal.ingest.markResults, { results });

  const remaining = (batches ?? DEFAULT_QUEUE_BATCHES) - 1;
  if (remaining > 0 && claimed.length === limit) {
    await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
      store,
      batches: remaining,
      batchSize,
    });
  }

  const tally = (status: WorkerResult['status']) =>
    results.filter((result) => result.status === status).length;

  return {
    claimed: claimed.length,
    added: tally('done'),
    skipped: tally('skipped'),
    failed: tally('failed'),
  };
}

export const processQueue = internalAction({
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
  handler: async (ctx, { store, batches, batchSize }): Promise<QueueTotals> =>
    await loggedRun(ctx, 'drain', NO_QUEUE_WORK, () =>
      drainOneBatch(ctx, store, batches, batchSize),
    ),
});

/** One page of the worklist: every EAN `catalog` has no row for gets a queue
 * row. The cursor is persisted, so successive runs continue the pass instead
 * of rescanning from the top. */
export const fillMissingPage = internalMutation({
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

type FillTotals = { scanned: number; queued: number; passes: number };

const NO_FILL_WORK: FillTotals = { scanned: 0, queued: 0, passes: 0 };

export const fillMissing = internalAction({
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
  handler: async (ctx, { store, batches, pageSize }): Promise<FillTotals> =>
    await loggedRun(ctx, 'fill', NO_FILL_WORK, async (paused) => {
      const rounds = Math.max(batches ?? DEFAULT_FILL_BATCHES, 1);
      const totals: FillTotals = { scanned: 0, queued: 0, passes: 0 };
      let stopped = false;
      for (let i = 0; i < rounds; i += 1) {
        // Every round after the first re-reads pause. A drain gets this for
        // free because each of its batches is a fresh run; this loop is inside
        // one, so without the probe a long fill could not be stopped at all.
        if (i > 0 && (await paused())) {
          stopped = true;
          break;
        }
        const page: {
          scanned: number;
          queued: number;
          wrapped: boolean;
        } = await ctx.runMutation(internal.ingest.fillMissingPage, {
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
      if (!stopped && totals.queued > 0) {
        await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
          store,
        });
      }
      return totals;
    }),
});
