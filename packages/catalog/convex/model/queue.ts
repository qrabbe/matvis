import type { StoreSlug } from '@matvis/shared';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { WithoutSystemFields } from 'convex/server';
import {
  QUEUE_STATUSES,
  type FillStats,
  type QueueStats,
  type QueueStatus,
} from './ingest';
import {
  bumpCounter,
  queueCountKey,
  readCounter,
  EANS_COUNT_KEY,
} from './counters';

type QueueRowFields = WithoutSystemFields<Doc<'ingest_queue'>>;

/** The queue's status counts are maintained, not counted, so `ingest.ts` never
 * writes `ingest_queue` directly. Every write goes through one of these. */
export async function insertQueueRow(
  ctx: MutationCtx,
  fields: QueueRowFields,
): Promise<Id<'ingest_queue'>> {
  await bumpCounter(ctx, queueCountKey(fields.status), 1);
  return await ctx.db.insert('ingest_queue', fields);
}

export async function setQueueStatus(
  ctx: MutationCtx,
  row: Doc<'ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  if (row.status !== status) {
    await bumpCounter(ctx, queueCountKey(row.status), -1);
    await bumpCounter(ctx, queueCountKey(status), 1);
  }
  await ctx.db.patch(row._id, { ...extra, status });
}

export async function deleteQueueRow(
  ctx: MutationCtx,
  row: Doc<'ingest_queue'>,
): Promise<void> {
  await bumpCounter(ctx, queueCountKey(row.status), -1);
  await ctx.db.delete(row._id);
}

export type QueueOutcome = 'queued' | 'known' | 'duplicate';

/** `known` means `catalog` already holds the row for this store, `duplicate`
 * means the queue already carries a row for it. Both callers that add EANs, the
 * paste and the fill sweep, want exactly this decision.
 *
 * Scoped to one store throughout. A barcode Coop already sells is still work
 * for the ICA lane, and roughly a third of the two ranges overlap, so a check
 * that ignored the store would silently drop every shared product.
 *
 * Any queue row at all blocks. A stored product deletes its row rather than
 * parking it, so what survives is either unfinished work or a `skipped` memo,
 * and neither wants a second copy. */
export async function queueEanIfMissing(
  ctx: MutationCtx,
  store: StoreSlug,
  ean: string,
  source: string,
  now: number,
  sourceId?: string,
): Promise<QueueOutcome> {
  const held = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (q) => q.eq('ean', ean).eq('store', store))
    .first();
  if (held) return 'known';

  const queued = await ctx.db
    .query('ingest_queue')
    .withIndex('by_store_ean', (q) => q.eq('store', store).eq('ean', ean))
    .first();
  if (queued) return 'duplicate';

  await insertQueueRow(ctx, {
    ean,
    store,
    sourceId,
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
    skipped: counts[2]!,
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

/** The stop button, not a lock.
 *
 * There is one operator, so this never guards against a second one. It is the
 * only thing that can halt a run chain that reschedules itself, and it is the
 * precondition the counter rebuild checks before it starts paging. `loggedRun`
 * reads it once when a run opens, and a body that loops re-reads it between
 * rounds. */
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
 * null on the last page, so the worklist cycles forever.
 *
 * One cursor per store. The sweep walks `eans` filtered to a single store, so
 * a shared cursor would be read against the wrong range the moment a second
 * chain existed and each sweep would resume wherever the other one stopped. */
export async function readFillCursor(
  ctx: QueryCtx,
  store: StoreSlug,
): Promise<string | null> {
  return (await readSettings(ctx))?.fillCursors?.[store] ?? null;
}

export async function writeFillCursor(
  ctx: MutationCtx,
  store: StoreSlug,
  cursor: string | null,
): Promise<void> {
  const current: Partial<Record<StoreSlug, string>> =
    (await readSettings(ctx))?.fillCursors ?? {};
  const next = { ...current };
  if (cursor === null) delete next[store];
  else next[store] = cursor;
  await patchSettings(ctx, { fillCursors: next });
}

export async function readFillStats(
  ctx: QueryCtx,
  store: StoreSlug,
): Promise<FillStats> {
  const settings = await readSettings(ctx);
  return {
    eansKnown: await readCounter(ctx, EANS_COUNT_KEY),
    cursorAtEnd: (settings?.fillCursors?.[store] ?? null) === null,
  };
}
