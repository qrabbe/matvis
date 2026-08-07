import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { WithoutSystemFields } from 'convex/server';
import {
  QUEUE_DEDUP_SCAN,
  QUEUE_STATUSES,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  type FillStats,
  type QueueStats,
  type QueueStatus,
  type RunKind,
  type RunSummary,
} from './ingest';
import {
  bumpCounter,
  queueCountKey,
  readCounter,
  EANS_COUNT_KEY,
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

export type QueueOutcome = 'queued' | 'known' | 'duplicate';

/** `known` means `catalog` already holds the row, `duplicate` means the queue
 * already carries unfinished work for it. Both callers that add EANs, the paste
 * and the fill sweep, want exactly this decision. */
export async function queueEanIfMissing(
  ctx: MutationCtx,
  ean: string,
  source: string,
  now: number,
): Promise<QueueOutcome> {
  const held = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (q) => q.eq('ean', ean).eq('store', 'coop'))
    .first();
  if (held) return 'known';

  const existing = await ctx.db
    .query('coop_ingest_queue')
    .withIndex('by_ean', (q) => q.eq('ean', ean))
    .take(QUEUE_DEDUP_SCAN);
  if (existing.some((row) => row.status !== 'done')) return 'duplicate';

  await insertQueueRow(ctx, {
    ean,
    status: 'pending',
    attempts: 0,
    source,
    enqueuedAt: now,
  });
  return 'queued';
}

export async function readQueueStats(ctx: QueryCtx): Promise<QueueStats> {
  const counts = await Promise.all(
    QUEUE_STATUSES.map((status) => readCounter(ctx, queueCountKey(status))),
  );
  return {
    pending: counts[0]!,
    processing: counts[1]!,
    done: counts[2]!,
    skipped: counts[3]!,
    failed: counts[4]!,
  };
}

/** One row, read once. Every setting on it is reached through here so a handler
 * that wants two of them does not pay for two scans. */
async function readSettings(
  ctx: QueryCtx,
): Promise<Doc<'ingest_settings'> | null> {
  return await ctx.db.query('ingest_settings').first();
}

async function patchSettings(
  ctx: MutationCtx,
  fields: Partial<WithoutSystemFields<Doc<'ingest_settings'>>>,
): Promise<void> {
  const row = await readSettings(ctx);
  const next = { ...fields, updatedAt: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, next);
  } else {
    await ctx.db.insert('ingest_settings', { paused: false, ...next });
  }
}

export async function readPaused(ctx: QueryCtx): Promise<boolean> {
  return (await readSettings(ctx))?.paused ?? false;
}

export async function writePaused(
  ctx: MutationCtx,
  paused: boolean,
): Promise<void> {
  await patchSettings(ctx, { paused });
}

/** `null` means the sweep is at the start of a fresh pass. It wraps back to
 * null on the last page, so the worklist cycles forever. */
export async function readFillCursor(ctx: QueryCtx): Promise<string | null> {
  return (await readSettings(ctx))?.fillCursor ?? null;
}

export async function writeFillCursor(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<void> {
  await patchSettings(ctx, { fillCursor: cursor ?? undefined });
}

export async function readFillStats(ctx: QueryCtx): Promise<FillStats> {
  const settings = await readSettings(ctx);
  return {
    eansKnown: await readCounter(ctx, EANS_COUNT_KEY),
    cursorAtEnd: (settings?.fillCursor ?? null) === null,
  };
}

export async function insertRun(
  ctx: MutationCtx,
  kind: RunKind,
): Promise<Id<'ingest_runs'>> {
  const now = Date.now();
  const oldest = await ctx.db
    .query('ingest_runs')
    .order('asc')
    .take(RUN_LOG_TRIM);
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
