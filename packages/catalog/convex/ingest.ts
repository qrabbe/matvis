import { v, type Infer } from 'convex/values';
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import { sanitizeCoopProduct } from './coop/sanitize';
import {
  COOP_BATCH_SIZE,
  DEFAULT_FILL_BATCHES,
  DEFAULT_QUEUE_BATCHES,
  FILL_PAGE_SIZE,
  QUEUE_DEDUP_SCAN,
  QUEUE_MAINTENANCE_LIMIT,
  STALE_CLAIM_MS,
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
  id: v.id('coop_ingest_queue'),
  ean: v.string(),
});

const terminalStatusValidator = v.union(
  v.literal('done'),
  v.literal('skipped'),
  v.literal('failed'),
);

const workerResultValidator = v.object({
  id: v.id('coop_ingest_queue'),
  status: terminalStatusValidator,
  error: v.optional(v.string()),
});

type ClaimedRow = Infer<typeof claimedRowValidator>;
type WorkerResult = Infer<typeof workerResultValidator>;

export const enqueueEans = internalMutation({
  args: { eans: v.array(v.string()), source: v.string() },
  returns: v.object({
    queued: v.number(),
    known: v.number(),
    duplicate: v.number(),
  }),
  handler: async (ctx, { eans, source }) => {
    if (eans.length > COOP_BATCH_SIZE) {
      throw new Error(
        `enqueueEans takes at most ${COOP_BATCH_SIZE} EANs per call, got ${eans.length}`,
      );
    }
    const now = Date.now();
    const seen = new Set<string>();
    const totals = { queued: 0, known: 0, duplicate: 0 };

    for (const ean of eans) {
      if (seen.has(ean)) {
        totals.duplicate += 1;
        continue;
      }
      seen.add(ean);

      await rememberEan(ctx, 'coop', ean);
      totals[await queueEanIfMissing(ctx, ean, source, now)] += 1;
    }
    return totals;
  },
});

export const claimBatch = internalMutation({
  args: { limit: v.number() },
  returns: v.array(claimedRowValidator),
  handler: async (ctx, { limit }) => {
    const now = Date.now();

    const inFlight = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .take(limit);
    for (const row of inFlight) {
      if ((row.claimedAt ?? row.enqueuedAt) <= now - STALE_CLAIM_MS) {
        await setQueueStatus(ctx, row, 'pending', { claimedAt: undefined });
      }
    }

    const pending = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(limit);

    const claimed: ClaimedRow[] = [];
    for (const row of pending) {
      await setQueueStatus(ctx, row, 'processing', {
        attempts: row.attempts + 1,
        claimedAt: now,
      });
      claimed.push({ id: row._id, ean: row.ean });
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
  args: { limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status', (q) => q.eq('status', 'done'))
      .take(limit ?? QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) await deleteQueueRow(ctx, row);
    return { deleted: rows.length };
  },
});

export const requeueFailed = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status', (q) => q.eq('status', 'failed'))
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

export const removeQueueRows = internalMutation({
  args: { ean: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { ean }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_ean', (q) => q.eq('ean', ean))
      .take(QUEUE_DEDUP_SCAN);
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

async function drainOneBatch(
  ctx: ActionCtx,
  batches: number | undefined,
  batchSize: number | undefined,
): Promise<QueueTotals> {
  const limit = Math.min(batchSize ?? COOP_BATCH_SIZE, COOP_BATCH_SIZE);
  const claimed: ClaimedRow[] = await ctx.runMutation(
    internal.ingest.claimBatch,
    { limit },
  );
  if (claimed.length === 0) return { ...NO_QUEUE_WORK };

  const results: WorkerResult[] = [];
  let added = 0;
  let skipped = 0;
  let failed = 0;

  try {
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
        skipped += 1;
        continue;
      }
      try {
        await ctx.runMutation(internal.products.upsertCoopByEan, {
          data: sanitizeCoopProduct(item),
        });
        results.push({ id: row.id, status: 'done' });
        added += 1;
      } catch (error) {
        results.push({ id: row.id, status: 'failed', error: errorText(error) });
        failed += 1;
      }
    }
  } catch (error) {
    for (const row of claimed) {
      results.push({ id: row.id, status: 'failed', error: errorText(error) });
      failed += 1;
    }
  }

  await ctx.runMutation(internal.ingest.markResults, { results });

  const remaining = (batches ?? DEFAULT_QUEUE_BATCHES) - 1;
  if (remaining > 0 && claimed.length === limit) {
    await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
      batches: remaining,
      batchSize,
    });
  }

  return { claimed: claimed.length, added, skipped, failed };
}

export const processQueue = internalAction({
  args: { batches: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.object({
    claimed: v.number(),
    added: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, { batches, batchSize }): Promise<QueueTotals> =>
    await loggedRun(ctx, 'drain', NO_QUEUE_WORK, () =>
      drainOneBatch(ctx, batches, batchSize),
    ),
});

/** One page of the worklist: every EAN `catalog` has no row for gets a queue
 * row. The cursor is persisted, so successive runs continue the pass instead
 * of rescanning from the top. */
export const fillMissingPage = internalMutation({
  args: { pageSize: v.optional(v.number()) },
  returns: v.object({
    scanned: v.number(),
    queued: v.number(),
    wrapped: v.boolean(),
  }),
  handler: async (ctx, { pageSize }) => {
    const numItems = Math.min(pageSize ?? FILL_PAGE_SIZE, FILL_PAGE_SIZE);
    const cursor = await readFillCursor(ctx);
    const page = await ctx.db
      .query('eans')
      .withIndex('by_store_ean', (q) => q.eq('store', 'coop'))
      .paginate({ cursor, numItems });

    const now = Date.now();
    let queued = 0;
    for (const row of page.page) {
      if ((await queueEanIfMissing(ctx, row.ean, 'fill', now)) === 'queued') {
        queued += 1;
      }
    }

    await writeFillCursor(ctx, page.isDone ? null : page.continueCursor);
    return { scanned: page.page.length, queued, wrapped: page.isDone };
  },
});

type FillTotals = { scanned: number; queued: number; passes: number };

const NO_FILL_WORK: FillTotals = { scanned: 0, queued: 0, passes: 0 };

export const fillMissing = internalAction({
  args: { batches: v.optional(v.number()), pageSize: v.optional(v.number()) },
  returns: v.object({
    scanned: v.number(),
    queued: v.number(),
    passes: v.number(),
  }),
  handler: async (ctx, { batches, pageSize }): Promise<FillTotals> =>
    await loggedRun(ctx, 'fill', NO_FILL_WORK, async () => {
      const rounds = Math.max(batches ?? DEFAULT_FILL_BATCHES, 1);
      const totals: FillTotals = { scanned: 0, queued: 0, passes: 0 };
      for (let i = 0; i < rounds; i += 1) {
        const page: {
          scanned: number;
          queued: number;
          wrapped: boolean;
        } = await ctx.runMutation(internal.ingest.fillMissingPage, {
          pageSize,
        });
        totals.scanned += page.scanned;
        totals.queued += page.queued;
        if (page.wrapped) {
          totals.passes += 1;
          break;
        }
      }
      if (totals.queued > 0) {
        await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {});
      }
      return totals;
    }),
});
