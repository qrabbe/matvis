/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import {
  SYNC_BATCH_LIMIT,
  SYNC_MIN_INTERVAL_MS,
  SYNC_STAGGER_MS,
} from './validators';

const modules = import.meta.glob('./**/*.ts');

type Seed = {
  status: 'active' | 'needs_reauth' | 'revoked';
  syncedAgo?: number;
};

// Seed one account with a connection per row, returning their ids in order. The
// dispatcher only reads `status` and `lastSyncedAt`, so the token columns get a
// stand-in of the right shape and nothing here decrypts.
async function seedConnections(t: ReturnType<typeof convexTest>, rows: Seed[]) {
  return await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', { subject: 'sub-a' });
    const sealed = { keyVersion: 1, iv: 'aXY=', ciphertext: 'Y3Q=' };
    const ids: Id<'connections'>[] = [];
    for (const row of rows) {
      ids.push(
        await ctx.db.insert('connections', {
          accountId,
          store: 'coop',
          accessToken: sealed,
          accessTokenExpiresAt: 0,
          refreshToken: sealed,
          status: row.status,
          lastSyncedAt:
            row.syncedAgo === undefined
              ? undefined
              : Date.now() - row.syncedAgo,
        }),
      );
    }
    return ids;
  });
}

/** The syncs a dispatch queued, oldest scheduled time first. */
async function queuedSyncs(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs
      .sort((a, b) => a.scheduledTime - b.scheduledTime)
      .map((job) => ({
        connectionId: (job.args[0] as { connectionId: Id<'connections'> })
          .connectionId,
        scheduledTime: job.scheduledTime,
      }));
  });
}

const HOUR = 60 * 60 * 1000;

describe('scheduled sync dispatch', () => {
  // Fake timers throughout: a dispatch schedules real work, and nothing here
  // wants the first sync firing against a stand-in ciphertext.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('schedules the stale active connections, staggered', async () => {
    const t = convexTest(schema, modules);
    const [never, stale] = await seedConnections(t, [
      { status: 'active' },
      { status: 'active', syncedAgo: 3 * 24 * HOUR },
      { status: 'needs_reauth', syncedAgo: 3 * 24 * HOUR },
      { status: 'revoked' },
    ]);

    const result = await t.mutation(internal.crons.dispatchSync, {});
    expect(result).toEqual({ scheduled: 2, skipped: 0, paused: false });

    // Never-synced first, then the stalest, one stagger apart.
    const queued = await queuedSyncs(t);
    expect(queued.map((job) => job.connectionId)).toEqual([never, stale]);
    expect(queued[1]!.scheduledTime - queued[0]!.scheduledTime).toBe(
      SYNC_STAGGER_MS,
    );
  });

  test('leaves a recently synced connection alone', async () => {
    const t = convexTest(schema, modules);
    await seedConnections(t, [
      { status: 'active', syncedAgo: SYNC_MIN_INTERVAL_MS + HOUR },
      { status: 'active', syncedAgo: 2 * HOUR },
    ]);

    const result = await t.mutation(internal.crons.dispatchSync, {});
    expect(result).toEqual({ scheduled: 1, skipped: 1, paused: false });
  });

  test('bounds one dispatch to the batch limit', async () => {
    const t = convexTest(schema, modules);
    await seedConnections(
      t,
      Array.from({ length: SYNC_BATCH_LIMIT + 3 }, () => ({
        status: 'active' as const,
      })),
    );

    const result = await t.mutation(internal.crons.dispatchSync, {});
    expect(result.scheduled).toBe(SYNC_BATCH_LIMIT);
    expect(await queuedSyncs(t)).toHaveLength(SYNC_BATCH_LIMIT);
  });

  test('schedules nothing while syncing is paused', async () => {
    const t = convexTest(schema, modules);
    await seedConnections(t, [{ status: 'active' }]);
    await t.mutation(internal.model.syncRuns.setPaused, { paused: true });

    const result = await t.mutation(internal.crons.dispatchSync, {});
    expect(result).toEqual({ scheduled: 0, skipped: 0, paused: true });
    expect(await queuedSyncs(t)).toHaveLength(0);
  });
});
