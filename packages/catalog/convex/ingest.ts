import { v, type Infer } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { sanitizeCoopProduct } from './coop/sanitize';
import {
  COOP_BATCH_SIZE,
  DEFAULT_QUEUE_BATCHES,
  DEFAULT_REFRESH_BATCHES,
  QUEUE_DEDUP_SCAN,
  QUEUE_MAINTENANCE_LIMIT,
  QUEUE_PAGE_SIZE,
  REFRESH_BATCH_SIZE,
  SEARCH_HITS_PER_NAME,
  STALE_CLAIM_MS,
  errorText,
  freshnessStatsValidator,
  queueKindValidator,
  queueRowValidator,
  queueStatsValidator,
  queueStatusValidator,
} from './model/ingest';
import {
  deleteQueueRow,
  insertQueueRow,
  readFreshnessStats,
  readQueueStats,
  setQueueStatus,
  setQueueStatusById,
  stampFetched,
} from './model/ops';
import { loggedRun } from './model/runs';

const claimedRowValidator = v.object({
  id: v.id('coop_ingest_queue'),
  kind: queueKindValidator,
  ean: v.optional(v.string()),
  query: v.optional(v.string()),
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
  ean: v.optional(v.string()),
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
    let queued = 0;
    let known = 0;
    let duplicate = 0;

    for (const ean of eans) {
      if (seen.has(ean)) {
        duplicate += 1;
        continue;
      }
      seen.add(ean);

      const raw = await ctx.db
        .query('raw_coop')
        .withIndex('by_ean', (q) => q.eq('ean', ean))
        .first();
      if (raw) {
        known += 1;
        continue;
      }

      const existing = await ctx.db
        .query('coop_ingest_queue')
        .withIndex('by_ean', (q) => q.eq('ean', ean))
        .take(QUEUE_DEDUP_SCAN);
      if (existing.some((row) => row.status !== 'done')) {
        duplicate += 1;
        continue;
      }

      await insertQueueRow(ctx, {
        kind: 'ean',
        ean,
        status: 'pending',
        attempts: 0,
        source,
        enqueuedAt: now,
      });
      queued += 1;
    }
    return { queued, known, duplicate };
  },
});

export const enqueueName = internalMutation({
  args: { query: v.string(), source: v.optional(v.string()) },
  returns: v.object({
    status: v.union(v.literal('queued'), v.literal('duplicate')),
  }),
  handler: async (ctx, { query, source }) => {
    const text = query.trim();
    if (!text) throw new Error('enqueueName got empty query text');

    const existing = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_kind_query', (q) => q.eq('kind', 'name').eq('query', text))
      .take(QUEUE_DEDUP_SCAN);
    if (existing.some((row) => row.status !== 'done')) {
      return { status: 'duplicate' as const };
    }

    await insertQueueRow(ctx, {
      kind: 'name',
      query: text,
      status: 'pending',
      attempts: 0,
      source: source ?? 'manual',
      enqueuedAt: Date.now(),
    });
    return { status: 'queued' as const };
  },
});

export const claimBatch = internalMutation({
  args: { limit: v.number() },
  returns: v.array(claimedRowValidator),
  handler: async (ctx, { limit }) => {
    const now = Date.now();

    const inFlight = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) => q.eq('status', 'processing'))
      .take(limit);
    for (const row of inFlight) {
      if ((row.claimedAt ?? row.enqueuedAt) <= now - STALE_CLAIM_MS) {
        await setQueueStatus(ctx, row, 'pending', { claimedAt: undefined });
      }
    }

    const eanRows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) =>
        q.eq('status', 'pending').eq('kind', 'ean'),
      )
      .take(limit);
    const nameRows =
      eanRows.length < limit
        ? await ctx.db
            .query('coop_ingest_queue')
            .withIndex('by_status_kind', (q) =>
              q.eq('status', 'pending').eq('kind', 'name'),
            )
            .take(limit - eanRows.length)
        : [];

    const claimed: ClaimedRow[] = [];
    for (const row of [...eanRows, ...nameRows]) {
      await setQueueStatus(ctx, row, 'processing', {
        attempts: row.attempts + 1,
        claimedAt: now,
      });
      claimed.push({
        id: row._id,
        kind: row.kind,
        ean: row.ean,
        query: row.query,
      });
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
        ...(result.ean ? { ean: result.ean } : {}),
      });
    }
    return null;
  },
});

export const queueStats = internalQuery({
  args: {},
  returns: queueStatsValidator,
  handler: async (ctx) => await readQueueStats(ctx),
});

export const freshnessStats = internalQuery({
  args: {},
  returns: freshnessStatsValidator,
  handler: async (ctx) => await readFreshnessStats(ctx),
});

export const listQueueRows = internalQuery({
  args: {
    status: queueStatusValidator,
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    rows: v.array(queueRowValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { status, cursor, numItems }) => {
    const page = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) => q.eq('status', status))
      .order('desc')
      .paginate({
        cursor: cursor ?? null,
        numItems: Math.min(numItems ?? QUEUE_PAGE_SIZE, QUEUE_PAGE_SIZE),
      });
    return {
      rows: page.page.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        kind: row.kind,
        ean: row.ean,
        query: row.query,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        source: row.source,
        enqueuedAt: row.enqueuedAt,
        processedAt: row.processedAt,
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const clearDoneRows = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) => q.eq('status', 'done'))
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
      .withIndex('by_status_kind', (q) => q.eq('status', 'failed'))
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
  args: { ean: v.optional(v.string()), query: v.optional(v.string()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { ean, query }) => {
    const text = query?.trim();
    if (!ean && !text) {
      throw new Error('removeQueueRows needs an ean or a query');
    }
    const rows = ean
      ? await ctx.db
          .query('coop_ingest_queue')
          .withIndex('by_ean', (q) => q.eq('ean', ean))
          .take(QUEUE_DEDUP_SCAN)
      : await ctx.db
          .query('coop_ingest_queue')
          .withIndex('by_kind_query', (q) =>
            q.eq('kind', 'name').eq('query', text),
          )
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
  if (claimed.length === 0) {
    return { claimed: 0, added: 0, skipped: 0, failed: 0 };
  }

  const results: WorkerResult[] = [];
  let added = 0;
  let skipped = 0;
  let failed = 0;

  const eanRows: { id: Id<'coop_ingest_queue'>; ean: string }[] = [];
  const nameRows: ClaimedRow[] = [];
  for (const row of claimed) {
    if (row.kind === 'name') {
      nameRows.push(row);
    } else if (row.ean) {
      eanRows.push({ id: row.id, ean: row.ean });
    } else {
      results.push({
        id: row.id,
        status: 'failed',
        error: 'ean row carries no EAN',
      });
      failed += 1;
    }
  }

  if (eanRows.length > 0) {
    try {
      const items: Record<string, unknown>[] = await ctx.runAction(
        internal.coop.fetch.fetchByEan,
        { eans: eanRows.map((row) => row.ean) },
      );
      const byEan = new Map(items.map((item) => [item.ean as string, item]));
      for (const row of eanRows) {
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
          await ctx.runMutation(internal.raw.upsertCoopByEan, {
            data: sanitizeCoopProduct(item),
          });
          results.push({ id: row.id, status: 'done' });
          added += 1;
        } catch (error) {
          results.push({
            id: row.id,
            status: 'failed',
            error: errorText(error),
          });
          failed += 1;
        }
      }
    } catch (error) {
      for (const row of eanRows) {
        results.push({
          id: row.id,
          status: 'failed',
          error: errorText(error),
        });
        failed += 1;
      }
    }
  }

  for (const row of nameRows) {
    const text = row.query?.trim();
    if (!text) {
      results.push({
        id: row.id,
        status: 'failed',
        error: 'name row carries no query text',
      });
      failed += 1;
      continue;
    }
    try {
      const hits: Record<string, unknown>[] = await ctx.runAction(
        internal.coop.fetch.searchByName,
        { query: text, take: SEARCH_HITS_PER_NAME },
      );
      const top = hits[0];
      if (!top) {
        results.push({
          id: row.id,
          status: 'skipped',
          error: `no Coop results for "${text}"`,
        });
        skipped += 1;
        continue;
      }
      for (const hit of hits) {
        try {
          await ctx.runMutation(internal.raw.upsertCoopByEan, {
            data: sanitizeCoopProduct(hit),
          });
          added += 1;
        } catch {}
      }
      results.push({
        id: row.id,
        status: 'done',
        ean: top.ean as string,
      });
    } catch (error) {
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

export const claimOldestForRefresh = internalMutation({
  args: { limit: v.number() },
  returns: v.object({ eans: v.array(v.string()), claimed: v.number() }),
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query('raw_coop')
      .withIndex('by_lastFetchedAt')
      .take(limit);
    const eans: string[] = [];
    for (const row of rows) {
      await stampFetched(ctx, row, now);
      if (row.ean) eans.push(row.ean);
    }
    return { eans, claimed: rows.length };
  },
});

type RefreshTotals = {
  claimed: number;
  refreshed: number;
  missing: number;
  failed: number;
};

const NO_REFRESH_WORK: RefreshTotals = {
  claimed: 0,
  refreshed: 0,
  missing: 0,
  failed: 0,
};

async function refreshOneBatch(
  ctx: ActionCtx,
  batches: number | undefined,
  batchSize: number | undefined,
): Promise<RefreshTotals> {
  const limit = Math.min(batchSize ?? REFRESH_BATCH_SIZE, COOP_BATCH_SIZE);
  const claim: { eans: string[]; claimed: number } = await ctx.runMutation(
    internal.ingest.claimOldestForRefresh,
    { limit },
  );
  if (claim.claimed === 0) {
    return { claimed: 0, refreshed: 0, missing: 0, failed: 0 };
  }

  const items: Record<string, unknown>[] = await ctx.runAction(
    internal.coop.fetch.fetchByEan,
    { eans: claim.eans },
  );

  let refreshed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await ctx.runMutation(internal.raw.upsertCoopByEan, {
        data: sanitizeCoopProduct(item),
      });
      refreshed += 1;
    } catch {
      failed += 1;
    }
  }

  const remaining = (batches ?? DEFAULT_REFRESH_BATCHES) - 1;
  if (remaining > 0 && claim.claimed === limit) {
    await ctx.scheduler.runAfter(0, internal.ingest.refreshOldest, {
      batches: remaining,
      batchSize,
    });
  }

  const returned = new Set(items.map((item) => item.ean as string));
  return {
    claimed: claim.claimed,
    refreshed,
    missing: claim.eans.filter((ean) => !returned.has(ean)).length,
    failed,
  };
}

export const refreshOldest = internalAction({
  args: { batches: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.object({
    claimed: v.number(),
    refreshed: v.number(),
    missing: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, { batches, batchSize }): Promise<RefreshTotals> =>
    await loggedRun(ctx, 'refresh', NO_REFRESH_WORK, () =>
      refreshOneBatch(ctx, batches, batchSize),
    ),
});
