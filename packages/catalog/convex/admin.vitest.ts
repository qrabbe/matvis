/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import {
  SESSION_TTL_MS,
  SIGNIN_FAILURE_LIMIT,
  SIGNIN_WINDOW_MS,
  sha256Hex,
} from './model/admin';

const modules = import.meta.glob('./**/*.ts');

const PASSWORD = 'correct horse battery staple';
process.env.CATALOG_ADMIN_PASSWORD = PASSWORD;

/** Sign in for real and hand back the token the console would store. */
async function signIn(t: ReturnType<typeof convexTest>) {
  const { token } = await t.action(api.admin.signIn, { password: PASSWORD });
  return token;
}

/** Every live session row. The table holds single digits of rows by design. */
async function sessions(t: ReturnType<typeof convexTest>) {
  return await t.run(
    async (ctx) => await ctx.db.query('admin_sessions').take(20),
  );
}

/**
 * Count `n` failed sign-ins without paying the deliberate one second delay per
 * guess. This is the mutation `signIn` itself calls on a wrong password.
 */
async function recordFailures(t: ReturnType<typeof convexTest>, n: number) {
  for (let i = 0; i < n; i += 1) {
    await t.mutation(internal.admin.recordSignInFailure, {});
  }
}

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
    // The token itself is never written down anywhere.
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

    // A read returns null rather than throwing, which is how the console tells
    // signed out from broken.
    expect(await t.query(api.admin.overview, { token })).not.toBeNull();
    expect(await t.query(api.admin.overview, { token: 'bogus' })).toBeNull();

    // A write throws, where a silent no-op would be the wrong failure mode.
    await expect(
      t.mutation(api.admin.setPaused, { token: 'bogus', paused: true }),
    ).rejects.toThrow(/Not signed in/);
    // And so does an action, which checks by hash through its own query.
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

describe('the sign-in lockout', () => {
  test('locks the door on the guess after the limit, and clears after the window', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT - 1);
    // Nine wrong guesses is not a lockout.
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
    // The tenth fills the window, so the eleventh guess is refused unheard.
    await recordFailures(t, 1);
    const gate = await t.query(internal.admin.signInGate, {});
    expect(gate.lockedUntil).toBeGreaterThan(Date.now());

    // Locked, and told apart from a wrong password by the message only.
    await expect(
      t.action(api.admin.signIn, { password: PASSWORD }),
    ).rejects.toThrow(/locked for up to an hour/);
    expect(await sessions(t)).toEqual([]);

    // Age the lock out of the way, as an hour of waiting would.
    await t.run(async (ctx) => {
      const guard = await ctx.db.query('admin_signin_guard').first();
      await ctx.db.patch(guard!._id, { lockedUntil: Date.now() - 1 });
    });
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
    expect(await signIn(t)).toMatch(/^[0-9a-f]{64}$/);

    // A successful sign-in clears the counter, so the next bad guess starts over.
    const guard = await t.run(
      async (ctx) => await ctx.db.query('admin_signin_guard').first(),
    );
    expect(guard?.failures).toBe(0);
    expect(guard?.lockedUntil).toBeUndefined();
  });

  test('failures spread wider than the window never add up to a lockout', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT - 1);
    // Push the window start into the past, as a day between guesses would.
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
    // The stale window restarts at one rather than tipping over the limit.
    expect(guard?.failures).toBe(1);
    expect(await t.query(internal.admin.signInGate, {})).toEqual({
      lockedUntil: null,
    });
  });
});
