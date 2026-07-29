/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { MAX_SYNC_ERROR_LENGTH, SYNC_RUN_TTL_MS } from './validators';

const modules = import.meta.glob('./**/*.ts');

// Seed one account with one linked connection. The run log only ever needs a
// connection id, so nothing here decrypts or syncs.
async function seedConnection(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', { subject: 'sub-a' });
    const sealed = { keyVersion: 1, iv: 'aXY=', ciphertext: 'Y3Q=' };
    return await ctx.db.insert('connections', {
      accountId,
      store: 'coop',
      accessToken: sealed,
      accessTokenExpiresAt: 0,
      refreshToken: sealed,
      status: 'active' as const,
    });
  });
}

describe('sync run log', () => {
  test('a run opens as running and settles with its counts', async () => {
    const t = convexTest(schema, modules);
    const connectionId = await seedConnection(t);
    const runId = await t.mutation(internal.model.syncRuns.startRun, {
      connectionId,
    });
    const opened = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(opened?.status).toBe('running');
    expect(opened?.finishedAt).toBeUndefined();

    await t.mutation(internal.model.syncRuns.finishRun, {
      runId,
      status: 'ok',
      synced: 2,
      skipped: 5,
    });
    const settled = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(settled?.status).toBe('ok');
    expect(settled?.synced).toBe(2);
    expect(settled?.skipped).toBe(5);
    expect(settled?.finishedAt).toBeGreaterThanOrEqual(settled!.startedAt);
  });

  test('a failure keeps a bounded error string', async () => {
    const t = convexTest(schema, modules);
    const connectionId = await seedConnection(t);
    const runId = await t.mutation(internal.model.syncRuns.startRun, {
      connectionId,
    });
    await t.mutation(internal.model.syncRuns.finishRun, {
      runId,
      status: 'error',
      error: 'x'.repeat(MAX_SYNC_ERROR_LENGTH + 100),
    });
    const settled = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(settled?.status).toBe('error');
    expect(settled?.error).toHaveLength(MAX_SYNC_ERROR_LENGTH);
  });

  test('opening a run sweeps expired rows and keeps live ones', async () => {
    const t = convexTest(schema, modules);
    const connectionId = await seedConnection(t);
    const now = Date.now();
    const { expired, live } = await t.run(async (ctx) => ({
      expired: await ctx.db.insert('syncRuns', {
        connectionId,
        status: 'ok' as const,
        startedAt: now - SYNC_RUN_TTL_MS - 1,
      }),
      live: await ctx.db.insert('syncRuns', {
        connectionId,
        status: 'ok' as const,
        startedAt: now - 1000,
      }),
    }));
    await t.mutation(internal.model.syncRuns.startRun, { connectionId });
    const rows = await t.run(async (ctx) => ({
      expired: await ctx.db.get(expired),
      live: await ctx.db.get(live),
    }));
    expect(rows.expired).toBeNull();
    expect(rows.live).not.toBeNull();
  });
});

describe('sync pause switch', () => {
  test('defaults to running and survives a flip back', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.model.syncRuns.isPaused, {})).toBe(false);
    await t.mutation(internal.model.syncRuns.setPaused, { paused: true });
    expect(await t.query(internal.model.syncRuns.isPaused, {})).toBe(true);
    await t.mutation(internal.model.syncRuns.setPaused, { paused: false });
    expect(await t.query(internal.model.syncRuns.isPaused, {})).toBe(false);
    // one singleton row, not one per flip
    const count = await t.run(
      async (ctx) => (await ctx.db.query('syncSettings').take(5)).length,
    );
    expect(count).toBe(1);
  });
});
