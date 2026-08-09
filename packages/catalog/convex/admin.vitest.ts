/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import * as admin from './admin';
import schema from './schema';
import { upsertClean } from './model/project';
import { SEARCH_STATS_SAMPLE } from './model/search';
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

/** Wrong-password attempts, driven through the same door a real one uses. */
async function recordFailures(t: ReturnType<typeof convexTest>, n: number) {
  for (let i = 0; i < n; i += 1) {
    await t.mutation(internal.admin.resolveSignIn, {
      matched: false,
      tokenHash: 'unused',
      expiresAt: 0,
    });
  }
}

/** Every public name this module registers. The point of pinning it is that a
 * new one cannot appear by accident: adding a line here is the moment someone
 * has to ask whether the function is gated. `signIn` is the only bare
 * registration, because it is what issues the token the rest check. */
const PUBLIC_ADMIN_FUNCTIONS = [
  'coverage',
  'enqueueEans',
  'overview',
  'queueRows',
  'rebuildCounters',
  'removeQueueRows',
  'repairNetContent',
  'runHistory',
  'runs',
  'searchStats',
  'setPaused',
  'signIn',
  'signOutEverywhere',
  'startRun',
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
      t.action(api.admin.removeQueueRows, { token: 'bogus', ean: '73000000' }),
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
    await expect(
      t.action(api.admin.removeQueueRows, { token, ean: '73000000' }),
    ).rejects.toThrow(/Not signed in/);
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
      store: 'coop',
      rows: ['7300000000000', '7300000000001', '7300000000002'].map((ean) => ({
        ean,
      })),
      source: 'census',
    });
    const claimed = await t.mutation(internal.ingest.claimPendingEans, {
      store: 'coop',
      limit: 10,
    });
    await t.mutation(internal.ingest.settleClaimedRows, {
      results: claimed.map((row) => ({
        id: row.id,
        outcome: 'failed' as const,
        error: `no luck for ${row.ean}`,
      })),
    });

    // Failures sit under Pending carrying their error, which is what the
    // console shows now that there is no failed lane to filter to.
    const page = await t.query(api.admin.queueRows, {
      token,
      status: 'pending',
    });
    expect(page).not.toBeNull();
    expect(page!.rows).toHaveLength(3);
    expect(page!.rows[0].lastError).toMatch(/^no luck for /);
    expect(page!.rows[0].ean).toBe('7300000000002');

    const skipped = await t.query(api.admin.queueRows, {
      token,
      status: 'skipped',
    });
    expect(skipped!.rows).toEqual([]);
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
      store: 'coop',
      rows: ['7300000000000', '7300000000001'].map((ean) => ({ ean })),
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
  async function guardRow(t: ReturnType<typeof convexTest>) {
    return await t.run(
      async (ctx) => await ctx.db.query('admin_signin_guard').first(),
    );
  }

  test('locks the door on the guess after the limit, and clears after the window', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT - 1);
    expect((await guardRow(t))?.lockedUntil).toBeUndefined();

    await recordFailures(t, 1);
    expect((await guardRow(t))?.lockedUntil).toBeGreaterThan(Date.now());

    await expect(
      t.action(api.admin.signIn, { password: PASSWORD }),
    ).rejects.toThrow(/locked for up to an hour/);
    expect(await sessions(t)).toEqual([]);

    await t.run(async (ctx) => {
      const guard = await ctx.db.query('admin_signin_guard').first();
      await ctx.db.patch(guard!._id, { lockedUntil: Date.now() - 1 });
    });
    expect(await signIn(t)).toMatch(/^[0-9a-f]{64}$/);

    const guard = await guardRow(t);
    expect(guard?.failures).toBe(0);
    expect(guard?.lockedUntil).toBeUndefined();
  });

  /** A locked console does not extend its own lockout, so hammering it cannot
   * keep the operator out past the window. */
  test('an attempt while locked is refused without counting against the window', async () => {
    const t = convexTest(schema, modules);
    await recordFailures(t, SIGNIN_FAILURE_LIMIT);
    const locked = await guardRow(t);

    await recordFailures(t, 3);
    const after = await guardRow(t);
    expect(after?.failures).toBe(locked?.failures);
    expect(after?.lockedUntil).toBe(locked?.lockedUntil);
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
    const guard = await guardRow(t);
    expect(guard?.failures).toBe(1);
    expect(guard?.lockedUntil).toBeUndefined();
  });
});

describe('the run trend', () => {
  test('plots drains oldest first and leaves fills out of the added axis', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);

    await t.run(async (ctx) => {
      const at = Date.now();
      await ctx.db.insert('ingest_runs', {
        kind: 'drain',
        status: 'ok',
        startedAt: at - 3000,
        summary: { claimed: 10, added: 7, skipped: 2, failed: 1 },
      });
      // A fill reports scanned/queued and can never add a product, so drawing
      // it would put a zero on the chart for a run that had no chance of one.
      await ctx.db.insert('ingest_runs', {
        kind: 'fill',
        status: 'ok',
        startedAt: at - 2000,
        summary: { scanned: 500, queued: 40, passes: 0 },
      });
      await ctx.db.insert('ingest_runs', {
        kind: 'drain',
        status: 'ok',
        startedAt: at - 1000,
        summary: { claimed: 4, added: 0, skipped: 4, failed: 0 },
      });
    });

    const history = await t.query(api.admin.runHistory, { token });
    expect(history).not.toBeNull();
    expect(history!.map((run) => run.kind)).toEqual(['drain', 'drain']);
    // Oldest first: the chart reads left to right.
    expect(history![0]!.added).toBe(7);
    expect(history![1]!.added).toBe(0);
    expect(history![0]!.failed).toBe(1);
  });

  test('a run with no summary reads as zeroes rather than breaking the shape', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('ingest_runs', {
        kind: 'drain',
        status: 'error',
        startedAt: Date.now(),
        error: 'boom',
      });
    });

    const history = await t.query(api.admin.runHistory, { token });
    expect(history![0]).toMatchObject({
      status: 'error',
      added: 0,
      claimed: 0,
    });
  });
});

describe('search stats', () => {
  async function logSearches(
    t: ReturnType<typeof convexTest>,
    rows: { term: string; visitor?: string; results?: number }[],
  ) {
    for (const row of rows) {
      await t.mutation(api.search.logSearch, {
        term: row.term,
        visitor: row.visitor ?? 'v1',
        results: row.results ?? 3,
      });
    }
  }

  test('with no token it answers null, like every other adminQuery', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.admin.searchStats, { token: 'bogus' })).toBeNull();
  });

  test('repeated terms tally, and top comes back by count descending', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await logSearches(t, [
      { term: 'kaffe' },
      { term: 'kaffe' },
      { term: 'mjölk' },
      { term: 'kaffe' },
      { term: 'ost', visitor: 'v2' },
    ]);

    const stats = await t.query(api.admin.searchStats, { token });
    expect(stats!.sampled).toBe(5);
    expect(stats!.visitors).toBe(2);
    expect(stats!.top[0]).toMatchObject({ term: 'kaffe', count: 3 });
    expect(stats!.top.map((row) => row.count)).toEqual([3, 1, 1]);
  });

  test('a term that never found anything is reported as such', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await logSearches(t, [
      { term: 'quinoaflarn', results: 0 },
      { term: 'quinoaflarn', results: 0 },
      { term: 'mjölk', results: 4 },
    ]);

    const stats = await t.query(api.admin.searchStats, { token });
    const dead = stats!.top.find((row) => row.term === 'quinoaflarn');
    expect(dead).toMatchObject({ count: 2, zeroResults: 2 });
    expect(stats!.zeroResults).toBe(2);

    const alive = stats!.top.find((row) => row.term === 'mjölk');
    expect(alive!.zeroResults).toBe(0);
  });

  test('past the sample cap it stays capped, with oldestAt on the newest end', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await logSearches(
      t,
      Array.from({ length: SEARCH_STATS_SAMPLE + 20 }, (_, n) => ({
        term: `term-${n}`,
      })),
    );

    const stats = await t.query(api.admin.searchStats, { token });
    expect(stats!.sampled).toBe(SEARCH_STATS_SAMPLE);
    // The window is the newest 500, so its oldest row is not the first ever
    // written. Reading it as all-time is the mistake this field prevents.
    const first = await t.run(
      async (ctx) => await ctx.db.query('search_events').order('asc').take(1),
    );
    expect(stats!.oldestAt).toBeGreaterThan(first[0]!._creationTime);
  });

  test('the recent list truncates the visitor id rather than showing it whole', async () => {
    const t = convexTest(schema, modules);
    const token = await signIn(t);
    await logSearches(t, [
      { term: 'ost', visitor: 'abcdefghijklmnopqrstuvwxyz' },
    ]);

    const stats = await t.query(api.admin.searchStats, { token });
    expect(stats!.recent[0]!.visitor).toBe('abcdefgh');
  });
});
