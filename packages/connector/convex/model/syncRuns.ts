import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import {
  MAX_SYNC_ERROR_LENGTH,
  SYNC_RUN_TRIM,
  SYNC_RUN_TTL_MS,
  syncRunOutcomeValidator,
} from '../validators';

// The sync run log and the pause switch. They live here in the default Convex
// runtime for the same reason `model/receipts.ts` does: the sync action is
// `"use node"` and may export only actions, so every query and mutation it
// reaches goes through `internal.model.*`.
//
// Everything is internal. No portal screen reads a run row today; the log is
// for the dashboard and for whoever has to answer why a sync produced nothing.

/** Whether syncing is paused. Defaults to running, so a deployment with no
 * settings row behaves exactly as it did before the switch existed. */
export const isPaused = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const row = await ctx.db.query('syncSettings').first();
    return row?.paused ?? false;
  },
});

/** Stop or resume syncing, creating the singleton row on first use. */
export const setPaused = internalMutation({
  args: { paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { paused }) => {
    const row = await ctx.db.query('syncSettings').first();
    const fields = { paused, updatedAt: Date.now() };
    if (row) {
      await ctx.db.patch(row._id, fields);
    } else {
      await ctx.db.insert('syncSettings', fields);
    }
    return null;
  },
});

/**
 * Open a run row for a sync that is starting, sweeping a bounded slice of
 * expired rows on the way through. Ascending order means the sweep only ever
 * looks at the oldest {@link SYNC_RUN_TRIM} rows, so logging a run costs the
 * same whether the log is empty or months deep.
 */
export const startRun = internalMutation({
  args: { connectionId: v.id('connections') },
  returns: v.id('syncRuns'),
  handler: async (ctx, { connectionId }) => {
    const now = Date.now();
    const oldest = await ctx.db.query('syncRuns').take(SYNC_RUN_TRIM);
    for (const row of oldest) {
      if (row.startedAt < now - SYNC_RUN_TTL_MS) await ctx.db.delete(row._id);
    }
    return await ctx.db.insert('syncRuns', {
      connectionId,
      status: 'running',
      startedAt: now,
    });
  },
});

/** Settle an open run row with what the sync returned or threw. */
export const finishRun = internalMutation({
  args: {
    runId: v.id('syncRuns'),
    status: syncRunOutcomeValidator,
    synced: v.optional(v.number()),
    skipped: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, synced, skipped, error }) => {
    await ctx.db.patch(runId, {
      status,
      finishedAt: Date.now(),
      synced,
      skipped,
      error: error?.slice(0, MAX_SYNC_ERROR_LENGTH),
    });
    return null;
  },
});
