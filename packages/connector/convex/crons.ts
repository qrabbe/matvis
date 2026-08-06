import { cronJobs } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import {
  SYNC_BATCH_LIMIT,
  SYNC_MIN_INTERVAL_MS,
  SYNC_STAGGER_MS,
} from './validators';

export const dispatchSync = internalMutation({
  args: {},
  returns: v.object({
    scheduled: v.number(),
    skipped: v.number(),
    paused: v.boolean(),
  }),
  handler: async (ctx) => {
    if (await ctx.runQuery(internal.model.syncRuns.isPaused, {})) {
      return { scheduled: 0, skipped: 0, paused: true };
    }

    const due = await ctx.db
      .query('connections')
      .withIndex('by_status_last_synced', (q) => q.eq('status', 'active'))
      .take(SYNC_BATCH_LIMIT);

    const cutoff = Date.now() - SYNC_MIN_INTERVAL_MS;
    let scheduled = 0;
    for (const connection of due) {
      // The index is stalest first, so the first fresh connection ends the batch.
      if ((connection.lastSyncedAt ?? 0) > cutoff) break;
      await ctx.scheduler.runAfter(
        scheduled * SYNC_STAGGER_MS,
        internal.sync.syncScheduled,
        { connectionId: connection._id },
      );
      scheduled += 1;
    }
    return { scheduled, skipped: due.length - scheduled, paused: false };
  },
});

const crons = cronJobs();

crons.cron('daily receipt sync', '20 2 * * *', internal.crons.dispatchSync, {});

export default crons;
