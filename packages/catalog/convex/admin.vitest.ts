/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import * as admin from './admin';
import schema from './schema';
import { upsertClean } from './model/project';
import {
  SESSION_TTL_MS,
  SIGNIN_FAILURE_LIMIT,
  SIGNIN_WINDOW_MS,
  sha256Hex,
} from './model/admin';

const modules = import.meta.glob('./**/*.ts');

const PASSWORD = 'correct horse battery staple';
process.env.CATALOG_ADMIN_PASSWORD = PASSWORD;

async function signIn(t: ReturnType<typeof convexTest>) {
  const { token } = await t.action(api.admin.signIn, { password: PASSWORD });
  return token;
}

async function sessions(t: ReturnType<typeof convexTest>) {
  return await t.run(
    async (ctx) => await ctx.db.query('admin_sessions').take(20),
  );
}

async function recordFailures(t: ReturnType<typeof convexTest>, n: number) {
  for (let i = 0; i < n; i += 1) {
    await t.mutation(internal.admin.recordSignInFailure, {});
  }
}

/** Every public name this module registers. The point of pinning it is that a
 * new one cannot appear by accident: adding a line here is the moment someone
 * has to ask whether the function is gated. `signIn` is the only bare
 * registration, because it is what issues the token the rest check. */
const PUBLIC_ADMIN_FUNCTIONS = [
  'clearDoneRows',
  'coverage',
  'enqueueEans',
  'overview',
  'queueRows',
  'rebuildCounters',
  'removeQueueRows',
  'requeueFailed',
  'runs',
  'setPaused',
  'signIn',
  'signOutEverywhere',
  'startDrain',
  'startFill',
];

describe('the public surface', () => {
  test('admin.ts registers exactly the expected public functions', () => {
    const registered = Object.entries(admin)
      .filter(([, value]) => (value as { isPublic?: boolean })?.isPublic)
      .map(([name]) => name)
      .sort();

    expect(registered).toEqual(PUBLIC_ADMIN_FUNCTIONS);
  });
});

describe('sign-in', () => {
  test('the right password opens a session that stores only the hash', async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();
    const result = await t.action(api.admin.signIn, { password: PASSWORD });

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);

    const rows = await sessions(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(await sha256Hex(result.token));
    expect(rows[0].tokenHash).not.toBe(result.token);
  });

  test('a wrong password is refused and leaves no session behind', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.admin.signIn, { password: 'nope' }),
    ).rejects.toThrow(/Wrong password/);
    expect(await sessions(t)).toEqual([]);

    const guard = await t.run(
      async (ctx) => await ctx.db.query('admin_signin_guard').first(),
    );
    expect(guard?.failures).toBe(1);
    expect(guard?.lockedUntil).toBeUndefined();
  });
});

describe('the session gate', () => {
  test('a valid token resolves and an unknown one does not', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);

    expect(await t.query(api.admin.overview, { token })).not.toBeNull();
    expect(await t.query(api.admin.overview, { token: 'bogus' })).toBeNull();

    await expect(
      t.mutation(api.admin.setPaused, { token: 'bogus', paused: true }),
    ).rejects.toThrow(/Not signed in/);
    await expect(
      t.action(api.admin.clearDoneRows, { token: 'bogus' }),
    ).rejects.toThrow(/Not signed in/);

    await t.mutation(api.admin.setPaused, { token, paused: true });
    expect(await t.query(api.admin.overview, { token })).toMatchObject({
      paused: true,
    });
  });

  test('an expired token does not resolve, however valid it once was', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query('admin_sessions').take(1);
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });

    expect(await t.query(api.admin.overview, { token })).toBeNull();
    await expect(
      t.mutation(api.admin.setPaused, { token, paused: true }),
    ).rejects.toThrow(/Not signed in/);
    await expect(t.action(api.admin.clearDoneRows, { token })).rejects.toThrow(
      /Not signed in/,
    );
  });

  test('signing out everywhere revokes every session, including this one', async () => {
    const t = convexTest(schema, modules);
    const first = await signIn(t);
    const second = await signIn(t);
    expect(await sessions(t)).toHaveLength(2);

    expect(
      await t.mutation(api.admin.signOutEverywhere, { token: second }),
    ).toEqual({ revoked: 2, isDone: true });
    expect(await sessions(t)).toEqual([]);
    expect(await t.query(api.admin.overview, { token: first })).toBeNull();
    expect(await t.query(api.admin.overview, { token: second })).toBeNull();
  });

  test('a successful sign-in sweeps expired rows and keeps live ones', async () => {
    const t = convexTest(schema, modules);
    const live = await signIn(t);
    const expired = await t.run(
      async (ctx) =>
        await ctx.db.insert('admin_sessions', {
          tokenHash: 'stale',
          createdAt: Date.now() - SESSION_TTL_MS * 2,
          expiresAt: Date.now() - 1,
        }),
    );

    await signIn(t);
    const rows = await sessions(t);
    expect(rows.map((row) => row._id)).not.toContain(expired);
    expect(rows.map((row) => row.tokenHash)).toContain(await sha256Hex(live));
  });
});

describe('the queue console', () => {
  test('queueRows pages one status, newest first', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001', '7300000000002'],
      source: 'census',
    });
    const claimed = await t.mutation(internal.ingest.claimBatch, { limit: 10 });
    await t.mutation(internal.ingest.markResults, {
      results: claimed.map((row) => ({
        id: row.id,
        status: 'failed' as const,
        error: `no luck for ${row.ean}`,
      })),
    });

    const page = await t.query(api.admin.queueRows, {
      token,
      status: 'failed',
    });
    expect(page).not.toBeNull();
    expect(page!.rows).toHaveLength(3);
    expect(page!.rows[0].lastError).toMatch(/^no luck for /);
    expect(page!.rows[0].ean).toBe('7300000000002');

    const pending = await t.query(api.admin.queueRows, {
      token,
      status: 'pending',
    });
    expect(pending!.rows).toEqual([]);
  });
});

describe('freshness', () => {
  test('counts never-fetched exactly and buckets the sample by age', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      // Two rows from before the field existed, so they carry no stamp.
      for (const ean of ['7300000000000', '7300000000001']) {
        await ctx.db.insert('catalog', { ean, name: ean, store: 'coop' });
      }
      await upsertClean(
        ctx,
        { ean: '7300000000002', name: 'Fresh', store: 'coop' },
        now,
      );
      await upsertClean(
        ctx,
        { ean: '7300000000003', name: 'Stale', store: 'coop' },
        now - 200 * 24 * 60 * 60 * 1000,
      );
    });
    // The two direct inserts bypassed the counters, so recount before reading.
    await t.mutation(api.admin.setPaused, { token, paused: true });
    await t.action(api.admin.rebuildCounters, { token });

    const overview = await t.query(api.admin.overview, { token });
    expect(overview!.freshness).toMatchObject({
      verified: 2,
      never: 2,
      sample: { size: 4, week: 1, month: 0, older: 1, never: 2 },
    });
  });

  test('verifying a row that never was moves it out of never, once', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await t.run(async (ctx) => {
      await upsertClean(ctx, {
        ean: '7300000000000',
        name: 'A',
        store: 'coop',
      });
    });

    const first = await t.query(api.admin.overview, { token });
    expect(first!.freshness).toMatchObject({ verified: 1, never: 0 });

    // A second fetch of the same row is a re-verification, not a new one.
    await t.run(async (ctx) => {
      await upsertClean(ctx, {
        ean: '7300000000000',
        name: 'A again',
        store: 'coop',
      });
    });
    const second = await t.query(api.admin.overview, { token });
    expect(second!.freshness).toMatchObject({ verified: 1, never: 0 });
  });
});

describe('the counter repair', () => {
  test('refuses while ingest is running and recounts once paused', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await t.mutation(internal.ingest.enqueueEans, {
      eans: ['7300000000000', '7300000000001'],
      source: 'census',
    });

    await expect(
      t.action(api.admin.rebuildCounters, { token }),
    ).rejects.toThrow(/Pause ingest/);

    await t.mutation(api.admin.setPaused, { token, paused: true });
    // Drift the maintained counter, then prove the repair overwrites it.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('app_counters')
        .withIndex('by_key', (q) => q.eq('key', 'queue:pending'))
        .unique();
      await ctx.db.patch(row!._id, { value: 999 });
    });

    const result = await t.action(api.admin.rebuildCounters, { token });
    expect(result.queue).toMatchObject({ pending: 2 });
    expect(await t.query(api.admin.overview, { token })).toMatchObject({
      queue: expect.objectContaining({ pending: 2 }),
    });
  });
});

describe('the sign-in lockout', () => {
  test('locks the door on the guess after the limit, and clears after the window', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT - 1);
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
    await recordFailures(t, 1);
    const gate = await t.query(internal.admin.signInGate, {});
    expect(gate.lockedUntil).toBeGreaterThan(Date.now());

    await expect(
      t.action(api.admin.signIn, { password: PASSWORD }),
    ).rejects.toThrow(/locked for up to an hour/);
    expect(await sessions(t)).toEqual([]);

    await t.run(async (ctx) => {
      const guard = await ctx.db.query('admin_signin_guard').first();
      await ctx.db.patch(guard!._id, { lockedUntil: Date.now() - 1 });
    });
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
    expect(await signIn(t)).toMatch(/^[0-9a-f]{64}$/);

    const guard = await t.run(
      async (ctx) => await ctx.db.query('admin_signin_guard').first(),
    );
    expect(guard?.failures).toBe(0);
    expect(guard?.lockedUntil).toBeUndefined();
  });

  test('failures spread wider than the window never add up to a lockout', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT - 1);
    await t.run(async (ctx) => {
      const guard = await ctx.db.query('admin_signin_guard').first();
      await ctx.db.patch(guard!._id, {
        windowStartedAt: Date.now() - SIGNIN_WINDOW_MS - 1,
      });
    });

    await recordFailures(t, 1);
    const guard = await t.run(
      async (ctx) => await ctx.db.query('admin_signin_guard').first(),
    );
    expect(guard?.failures).toBe(1);
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
  });
});
