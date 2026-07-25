import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import {
  QUEUE_STAT_CAP,
  QUEUE_STATUSES,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  type RunKind,
  type RunSummary,
} from './ingest';

/**
 * Plain database helpers behind both the internal ingest functions and the admin
 * console's public surface.
 *
 * They live here rather than in `ingest.ts` because a Convex query cannot call
 * another query: `admin.overview` runs inside a `QueryCtx` of its own, so the
 * only way for it and `ingest.queueStats` to answer identically is for both to
 * call the same function.
 */

export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
  capped: boolean;
};

/**
 * Rows per queue status. Counts stop at {@link QUEUE_STAT_CAP} per status and
 * set `capped`, so asking how the queue is doing never turns into a scan of a
 * table holding 13k rows. A console renders a capped count as "1000+", which is
 * all anyone acts on.
 */
export async function readQueueStats(ctx: QueryCtx): Promise<QueueStats> {
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
}

export type FreshnessStats = {
  neverFetched: number;
  neverFetchedCapped: boolean;
  oldestFetchedAt: number | null;
};

/**
 * How stale the catalog is: how many `raw_coop` rows have never been fetched,
 * and when the oldest fetched row was last seen.
 *
 * One scan of the head of `by_lastFetchedAt` answers both, because Convex sorts
 * a missing field before any number: the never-fetched rows come first and the
 * first row after them carries the oldest `lastFetchedAt`. Capped like the queue
 * counts. `oldestFetchedAt` is null when the whole scan was never-fetched rows,
 * which reads as "everything ahead of this is older still".
 */
export async function readFreshnessStats(
  ctx: QueryCtx,
): Promise<FreshnessStats> {
  const rows = await ctx.db
    .query('raw_coop')
    .withIndex('by_lastFetchedAt')
    .take(QUEUE_STAT_CAP + 1);
  const neverFetched = rows.filter(
    (row) => row.lastFetchedAt === undefined,
  ).length;
  const oldest = rows.find((row) => row.lastFetchedAt !== undefined);
  return {
    neverFetched: Math.min(neverFetched, QUEUE_STAT_CAP),
    neverFetchedCapped: neverFetched > QUEUE_STAT_CAP,
    oldestFetchedAt: oldest?.lastFetchedAt ?? null,
  };
}

/** Whether ingest is paused. Defaults to running, so a deployment with no
 * settings row behaves exactly as it did before the switch existed. */
export async function readPaused(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db.query('ingest_settings').first();
  return row?.paused ?? false;
}

/** Set the pause switch, creating the singleton row on first use. */
export async function writePaused(
  ctx: MutationCtx,
  paused: boolean,
): Promise<void> {
  const row = await ctx.db.query('ingest_settings').first();
  const fields = { paused, updatedAt: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert('ingest_settings', fields);
  }
}

/**
 * Open a run row for an action that is about to start, sweeping a bounded slice
 * of expired rows on the way through. Ascending order means the sweep only ever
 * looks at the oldest {@link RUN_LOG_TRIM} rows, so logging a run costs the same
 * whether the log is empty or months deep.
 */
export async function insertRun(
  ctx: MutationCtx,
  kind: RunKind,
): Promise<Id<'ingest_runs'>> {
  const now = Date.now();
  const oldest = await ctx.db.query('ingest_runs').take(RUN_LOG_TRIM);
  for (const row of oldest) {
    if (row.startedAt < now - RUN_LOG_TTL_MS) await ctx.db.delete(row._id);
  }
  return await ctx.db.insert('ingest_runs', {
    kind,
    status: 'running',
    startedAt: now,
  });
}

/** Settle an open run row with what the action returned or threw. */
export async function settleRun(
  ctx: MutationCtx,
  runId: Id<'ingest_runs'>,
  outcome: {
    status: 'ok' | 'paused' | 'error';
    summary?: RunSummary;
    error?: string;
  },
): Promise<void> {
  await ctx.db.patch(runId, {
    status: outcome.status,
    finishedAt: Date.now(),
    summary: outcome.summary,
    error: outcome.error,
  });
}

/** The newest {@link RUN_LOG_PAGE} runs, newest first. */
export async function readRecentRuns(ctx: QueryCtx) {
  return await ctx.db.query('ingest_runs').order('desc').take(RUN_LOG_PAGE);
}
