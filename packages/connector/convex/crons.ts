import { cronJobs } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import {
  SYNC_BATCH_LIMIT,
  SYNC_MIN_INTERVAL_MS,
  SYNC_STAGGER_MS,
} from './validators';

/**
 * The scheduled sync.
 *
 * Without it a linked account gets its receipt history once, at link time, and
 * then goes stale until someone re-walks the entire BankID flow, because that
 * flow is the only caller of `sync.sync`. Every time-series view in the app —
 * the activity heatmap, nutrition trends, spend by month — quietly assumes that
 * is not the case.
 *
 * A dispatcher rather than one job that syncs everything: an action has a
 * wall-clock limit and each sync fetches and parses a PDF per new receipt, so
 * this schedules one sync per due connection, staggered, and holds none of them
 * open itself.
 *
 * Turning a schedule on is only safe because step 22 landed first. `syncRuns` is
 * where a run nobody is watching says what it did, and `syncSettings.paused` is
 * checked both here and again at the top of every sync, so syncing can be
 * stopped from outside without a deploy — including the syncs a dispatch has
 * already queued.
 */
export const dispatchSync = internalMutation({
  args: {},
  returns: v.object({
    scheduled: v.number(),
    skipped: v.number(),
    paused: v.boolean(),
  }),
  handler: async (ctx) => {
    // Checked here as well as inside each sync, so a paused deployment logs
    // nothing rather than one `paused` run row per connection per night.
    if (await ctx.runQuery(internal.model.syncRuns.isPaused, {})) {
      return { scheduled: 0, skipped: 0, paused: true };
    }

    // `active` only. A connection the last sync flipped to `needs_reauth` is
    // waiting on a human with a BankID, not on a retry, and hammering it nightly
    // would only cost a failed token refresh a day.
    const due = await ctx.db
      .query('connections')
      .withIndex('by_status_last_synced', (q) => q.eq('status', 'active'))
      .take(SYNC_BATCH_LIMIT);

    const cutoff = Date.now() - SYNC_MIN_INTERVAL_MS;
    let scheduled = 0;
    for (const connection of due) {
      // Stalest first, so the first connection synced recently ends the batch:
      // every one behind it is fresher again. Recent means a manual sync, or a
      // dispatch that has already been round tonight.
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

// Daily. Receipts appear a few times a week per household at most, and a sync is
// not cheap. 02:20 UTC is the small hours in Sweden, where the receipts are, and
// off the hour so a store-side rate limit is not something every deployment
// walks into at once.
crons.cron('daily receipt sync', '20 2 * * *', internal.crons.dispatchSync, {});

export default crons;
