import { v, type Infer } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
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
  QUEUE_STAT_CAP,
  QUEUE_STATUSES,
  REFRESH_BATCH_SIZE,
  SEARCH_HITS_PER_NAME,
  STALE_CLAIM_MS,
  queueKindValidator,
} from './model/ingest';

/**
 * Coop ingest: the queue, its worker, and the freshness sweep.
 *
 * EVERY function here is internal. The catalog deployment has no auth — it is a
 * public read-only backend — so a public ingest function would let anyone burn
 * Coop's API key and write to the raw tables. Ingest is driven by `crons.ts` or
 * by `bunx convex run`, never by a client. This is the one place the port
 * departs from the old repo, which gated the same functions behind `requireAdmin`.
 *
 * The HTTP calls themselves live in `coop/fetch.ts` and `coop/discovery.ts`,
 * which hold nothing else, so either can flip to the Node runtime without
 * dragging these reads and writes along.
 */

/** A row the worker has claimed, as it travels from mutation to action. */
const claimedRowValidator = v.object({
  id: v.id('coop_ingest_queue'),
  kind: queueKindValidator,
  ean: v.optional(v.string()),
  query: v.optional(v.string()),
});

/** The three states a claimed row can settle into. */
const terminalStatusValidator = v.union(
  v.literal('done'),
  v.literal('skipped'),
  v.literal('failed'),
);

/** What the worker reports back for one claimed row. `ean` backfills the EAN a
 * name row resolved to, so the row records what it found. */
const workerResultValidator = v.object({
  id: v.id('coop_ingest_queue'),
  status: terminalStatusValidator,
  error: v.optional(v.string()),
  ean: v.optional(v.string()),
});

type ClaimedRow = Infer<typeof claimedRowValidator>;
type WorkerResult = Infer<typeof workerResultValidator>;

/** Longest error text kept on a queue row, so one huge upstream message can't
 * dominate the document. */
const MAX_ERROR_LENGTH = 500;

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

// ── Queue writes ─────────────────────────────────────────────────────────────

/**
 * Enqueue EANs discovered upstream, skipping the ones there is no point fetching:
 * already in `raw_coop` (the refresh sweep owns those), or already carrying a
 * queue row that hasn't settled as `done`. That last rule is what stops a weekly
 * discovery run from re-queueing thousands of EANs Coop does not stock — their
 * `skipped` rows are the memo that we already asked.
 */
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

      await ctx.db.insert('coop_ingest_queue', {
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

/**
 * Enqueue one product name for the worker to resolve through Coop search. The
 * path a caller with a receipt line and no GTIN takes. Deduped on the exact
 * trimmed text, since that is what gets searched.
 */
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

    await ctx.db.insert('coop_ingest_queue', {
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

/**
 * Claim up to `limit` pending rows by flipping them to `processing`, EAN rows
 * before name rows: an exact id is cheaper and more certain than a search, and
 * one by-id request covers the whole EAN half of a batch.
 *
 * Claims left behind by a worker that died mid-batch are returned to `pending`
 * first, so a wall-clock timeout or a deploy costs a delay rather than a row.
 */
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
        await ctx.db.patch(row._id, {
          status: 'pending',
          claimedAt: undefined,
        });
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
      await ctx.db.patch(row._id, {
        status: 'processing',
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

/**
 * Settle a batch of claimed rows in one transaction. Batched because a worker
 * settles up to {@link COOP_BATCH_SIZE} rows per pass, and one round trip each
 * would dominate its wall clock.
 */
export const markResults = internalMutation({
  args: { results: v.array(workerResultValidator) },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const result of results) {
      await ctx.db.patch(result.id, {
        status: result.status,
        processedAt: now,
        // Both undefined on success, which clears a previous attempt's error and
        // releases the claim.
        lastError: result.error,
        claimedAt: undefined,
        ...(result.ean ? { ean: result.ean } : {}),
      });
    }
    return null;
  },
});

// ── Queue reads and maintenance ──────────────────────────────────────────────

/**
 * Rows per status, for a human checking on the queue with `convex run`. Counts
 * stop at {@link QUEUE_STAT_CAP} per status and set `capped`, so asking how the
 * queue is doing never turns into a scan of the whole thing.
 */
export const queueStats = internalQuery({
  args: {},
  returns: v.object({
    pending: v.number(),
    processing: v.number(),
    done: v.number(),
    skipped: v.number(),
    failed: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    const counts = {
      pending: 0,
      processing: 0,
      done: 0,
      skipped: 0,
      failed: 0,
    };
    let capped = false;
    for (const status of QUEUE_STATUSES) {
      const rows = await ctx.db
        .query('coop_ingest_queue')
        .withIndex('by_status_kind', (q) => q.eq('status', status))
        .take(QUEUE_STAT_CAP + 1);
      counts[status] = Math.min(rows.length, QUEUE_STAT_CAP);
      if (rows.length > QUEUE_STAT_CAP) capped = true;
    }
    return { ...counts, capped };
  },
});

/**
 * Delete settled `done` rows. Only `done`: a `skipped` row records that Coop has
 * no such product, and deleting it would let the next discovery run queue that
 * EAN again and re-learn the same thing.
 */
export const clearDoneRows = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) => q.eq('status', 'done'))
      .take(limit ?? QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

/** Put failed rows back in line. Nothing retries them on its own — a failure is
 * kept for inspection until someone decides it was transient. */
export const requeueFailed = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status_kind', (q) => q.eq('status', 'failed'))
      .take(limit ?? QUEUE_MAINTENANCE_LIMIT);
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: 'pending',
        lastError: undefined,
        processedAt: undefined,
      });
    }
    return { requeued: rows.length };
  },
});

/**
 * Drop queue rows outright, by EAN or by search text. The way out of a row
 * nothing else can clear: a `skipped` EAN that Coop has since started stocking,
 * or a name row whose text was wrong. Unlike the port source, which only allowed
 * removing a `pending` row, this takes any status — that guard existed because
 * the old mutation was reachable from a UI, and nothing here is.
 */
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
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

// ── Worker ───────────────────────────────────────────────────────────────────

type QueueTotals = {
  claimed: number;
  added: number;
  skipped: number;
  failed: number;
};

/**
 * Drain the queue: claim a batch, resolve it, write it through
 * `raw.upsertCoopByEan`, settle the rows, and schedule a continuation while
 * there is more to do and budget left. Safe to run at any time and from
 * anywhere — the claim is what makes two overlapping runs take disjoint work.
 *
 * `added` counts products written, which for a name row can exceed one: the
 * search endpoint returns near-complete payloads, so every hit is ingested.
 */
export const processQueue = internalAction({
  args: { batches: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.object({
    claimed: v.number(),
    added: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  // Explicit return type: this action calls internal functions from its own
  // module, which TypeScript cannot infer through without help.
  handler: async (ctx, { batches, batchSize }): Promise<QueueTotals> => {
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

    // Split the claim by how each row resolves. An `ean` row that somehow has no
    // EAN can't resolve at all, so it settles here rather than reaching Coop.
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

    // EAN half: one request for the lot, results matched back by EAN.
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
            // Coop answers only for what it stocks, with no placeholder for the
            // rest, so a missing result IS the answer.
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
        // The request itself failed. Settle the rows as failed rather than let
        // them sit in `processing` until the stale-claim timeout.
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

    // Name half: one search each, every hit ingested, the top hit recorded as
    // what the row resolved to.
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
          } catch {
            // Best effort: one unwritable hit must not fail the row, whose
            // resolution succeeded.
          }
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

    // A short claim means the queue is drained, so stop early rather than spend
    // the rest of the budget on empty batches.
    const remaining = (batches ?? DEFAULT_QUEUE_BATCHES) - 1;
    if (remaining > 0 && claimed.length === limit) {
      await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
        batches: remaining,
        batchSize,
      });
    }

    return { claimed: claimed.length, added, skipped, failed };
  },
});

// ── Freshness sweep ──────────────────────────────────────────────────────────

/**
 * Take the `limit` least recently fetched `raw_coop` rows and stamp them as
 * fetched NOW, returning their EANs.
 *
 * Stamping on claim rather than on result is deliberate. A product Coop has
 * delisted comes back from the by-id call as nothing at all, and a payload that
 * fails to write comes back as an error — in both cases stamping on result would
 * leave the row parked at the head of `by_lastFetchedAt`, and every sweep from
 * then on would re-pick the same rows instead of working through the catalog. A
 * successful refresh re-stamps a moment later anyway.
 */
export const claimOldestForRefresh = internalMutation({
  args: { limit: v.number() },
  returns: v.object({ eans: v.array(v.string()), claimed: v.number() }),
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    // Ascending over `by_lastFetchedAt`, where a missing field sorts before any
    // number — so rows from the original snapshot import, which predate the
    // column, are swept first.
    const rows = await ctx.db
      .query('raw_coop')
      .withIndex('by_lastFetchedAt')
      .take(limit);
    const eans: string[] = [];
    for (const row of rows) {
      await ctx.db.patch(row._id, { lastFetchedAt: now });
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

/**
 * Re-fetch the oldest slice of the catalog. A sweep, not a re-scrape: a daily
 * cron spends a fixed budget of batches on whatever is stalest, so the whole
 * catalog turns over roughly weekly without ever asking Coop for 13k products at
 * once. `missing` counts rows Coop no longer returns; they keep their existing
 * data and simply stop being re-fetched until their turn comes round again.
 */
export const refreshOldest = internalAction({
  args: { batches: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.object({
    claimed: v.number(),
    refreshed: v.number(),
    missing: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, { batches, batchSize }): Promise<RefreshTotals> => {
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
  },
});
