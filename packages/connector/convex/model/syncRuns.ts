import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import {
  MAX_SYNC_ERROR_LENGTH,
  SYNC_RUN_TRIM,
  SYNC_RUN_TTL_MS,
  syncRunOutcomeValidator,
} from '../validators';

export const isPaused = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const row = await ctx.db.query('syncSettings').first();
    return row?.paused ?? false;
  },
});

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
