/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

interface Unit {
  receiptId: string;
  lineNo: number;
  unitIndex: number;
}

const unit = (overrides: Partial<Unit> = {}): Unit => ({
  receiptId: 'r1',
  lineNo: 0,
  unitIndex: 0,
  ...overrides,
});

describe('mark', () => {
  test('records a finish and lists it back for the same token', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });

    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ receiptId: 'r1', outcome: 'finished' });
  });

  test('scopes marks to their own token', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });

    const marks = await t.query(api.marks.list, { token: 'tok_b' });
    expect(marks).toEqual([]);
  });

  test('replaces the existing mark for the same unit instead of duplicating it', async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.parse('2026-09-20'),
      finishedAtHandSet: false,
      via: 'tap',
    });
    const second = await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'wasted',
      finishedAt: Date.parse('2026-09-21'),
      finishedAtHandSet: true,
      via: 'details',
    });
    expect(second).toBe(first);

    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.outcome).toBe('wasted');
  });

  test('two different units on the same line get two marks', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit({ unitIndex: 0 }),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit({ unitIndex: 1 }),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks).toHaveLength(2);
  });

  test('rejects a finishedAt far in the future', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.marks.mark, {
        token: 'tok_a',
        ...unit(),
        outcome: 'finished',
        finishedAt: Date.now() + 7 * 86_400_000,
        finishedAtHandSet: false,
        via: 'tap',
      }),
    ).rejects.toThrow();
  });

  test('rejects a startedAt after finishedAt', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.marks.mark, {
        token: 'tok_a',
        ...unit(),
        outcome: 'finished',
        finishedAt: Date.parse('2026-09-01'),
        startedAt: Date.parse('2026-09-05'),
        finishedAtHandSet: false,
        via: 'tap',
      }),
    ).rejects.toThrow();
  });
});

describe('mark source', () => {
  test('is absent (meaning "user") when the caller does not set it', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks[0]?.source).toBeUndefined();
  });

  test('is stored as "backfill" when the one-time script sets it', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.parse('2026-06-01'),
      finishedAtHandSet: false,
      via: 'backfill',
      source: 'backfill',
    });
    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks[0]?.source).toBe('backfill');
  });
});

describe('markMany', () => {
  test('marks every unit in the batch with the same shared fields', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(api.marks.markMany, {
      token: 'tok_a',
      units: [unit({ unitIndex: 0 }), unit({ unitIndex: 1 })],
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'trip',
    });
    expect(ids).toHaveLength(2);
    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks.every((m) => m.via === 'trip')).toBe(true);
  });

  test('rejects a batch over the size cap', async () => {
    const t = convexTest(schema, modules);
    const units = Array.from({ length: 501 }, (_, i) => unit({ unitIndex: i }));
    await expect(
      t.mutation(api.marks.markMany, {
        token: 'tok_a',
        units,
        outcome: 'finished',
        finishedAt: Date.now(),
        finishedAtHandSet: false,
        via: 'trip',
      }),
    ).rejects.toThrow();
  });
});

describe('unmark', () => {
  test('removes a mark owned by the caller — "put back in the pantry"', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    await t.mutation(api.marks.unmark, { token: 'tok_a', ...unit() });
    const marks = await t.query(api.marks.list, { token: 'tok_a' });
    expect(marks).toEqual([]);
  });

  test('does nothing for a unit that was never marked', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.marks.unmark, { token: 'tok_a', ...unit() }),
    ).resolves.toBeNull();
  });
});

describe('exportAll', () => {
  test('returns only the caller’s own marks', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.marks.mark, {
      token: 'tok_a',
      ...unit(),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    await t.mutation(api.marks.mark, {
      token: 'tok_b',
      ...unit({ receiptId: 'r2' }),
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'tap',
    });
    const exported = await t.query(api.marks.exportAll, { token: 'tok_a' });
    expect(exported.marks).toHaveLength(1);
    expect(exported.marks[0]?.receiptId).toBe('r1');
  });
});
