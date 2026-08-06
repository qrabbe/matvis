import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { WithoutSystemFields } from 'convex/server';
import {
  QUEUE_STATUSES,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  type QueueStatus,
  type RunKind,
  type RunSummary,
} from './ingest';
import {
  bumpCounter,
  queueCountKey,
  readCounter,
  NEVER_FETCHED_KEY,
} from './counters';

type QueueRowFields = WithoutSystemFields<Doc<'coop_ingest_queue'>>;

/** The queue's status counts are maintained, not counted, so `ingest.ts` never
 * writes `coop_ingest_queue` directly. Every write goes through one of these. */
export async function insertQueueRow(
  ctx: MutationCtx,
  fields: QueueRowFields,
): Promise<Id<'coop_ingest_queue'>> {
  await bumpCounter(ctx, queueCountKey(fields.status), 1);
  return await ctx.db.insert('coop_ingest_queue', fields);
}

export async function setQueueStatus(
  ctx: MutationCtx,
  row: Doc<'coop_ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  if (row.status !== status) {
    await bumpCounter(ctx, queueCountKey(row.status), -1);
    await bumpCounter(ctx, queueCountKey(status), 1);
  }
  await ctx.db.patch(row._id, { ...extra, status });
}

export async function setQueueStatusById(
  ctx: MutationCtx,
  id: Id<'coop_ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  const row = await ctx.db.get(id);
  if (row) await setQueueStatus(ctx, row, status, extra);
}

export async function deleteQueueRow(
  ctx: MutationCtx,
  row: Doc<'coop_ingest_queue'>,
): Promise<void> {
  await bumpCounter(ctx, queueCountKey(row.status), -1);
  await ctx.db.delete(row._id);
}

export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
};

export async function readQueueStats(ctx: QueryCtx): Promise<QueueStats> {
  const counts = await Promise.all(
    QUEUE_STATUSES.map((status) => readCounter(ctx, queueCountKey(status))),
  );
  return {
    pending: counts[0],
    processing: counts[1],
    done: counts[2],
    skipped: counts[3],
    failed: counts[4],
  };
}

export type FreshnessStats = {
  neverFetched: number;
  oldestFetchedAt: number | null;
};

export async function readFreshnessStats(
  ctx: QueryCtx,
): Promise<FreshnessStats> {
  const oldest = await ctx.db
    .query('raw_coop')
    .withIndex('by_lastFetchedAt', (q) => q.gt('lastFetchedAt', 0))
    .first();
  return {
    neverFetched: await readCounter(ctx, NEVER_FETCHED_KEY),
    oldestFetchedAt: oldest?.lastFetchedAt ?? null,
  };
}

/** With `raw.upsertCoopByEan`, the only place `lastFetchedAt` is written, which
 * is what keeps NEVER_FETCHED_KEY honest. */
export async function stampFetched(
  ctx: MutationCtx,
  row: Doc<'raw_coop'>,
  at: number,
): Promise<void> {
  if (row.lastFetchedAt === undefined) {
    await bumpCounter(ctx, NEVER_FETCHED_KEY, -1);
  }
  await ctx.db.patch(row._id, { lastFetchedAt: at });
}

export async function readPaused(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db.query('ingest_settings').first();
  return row?.paused ?? false;
}

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

export async function readRecentRuns(ctx: QueryCtx) {
  return await ctx.db.query('ingest_runs').order('desc').take(RUN_LOG_PAGE);
}
