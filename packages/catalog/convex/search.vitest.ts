/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import {
  SEARCH_LOG_TTL_MS,
  SEARCH_TERM_MAX,
  VISITOR_MAX,
  normalizeTerm,
} from './model/search';

const modules = import.meta.glob('./**/*.ts');

async function events(t: ReturnType<typeof convexTest>) {
  return await t.run(
    async (ctx) => await ctx.db.query('search_events').take(50),
  );
}

async function log(
  t: ReturnType<typeof convexTest>,
  term: string,
  extra: { visitor?: string; results?: number } = {},
) {
  await t.mutation(api.search.logSearch, {
    term,
    visitor: extra.visitor ?? 'visitor-1',
    results: extra.results ?? 3,
  });
}

describe('normalizeTerm', () => {
  test('collapses the spellings that would otherwise split the tally', () => {
    expect(normalizeTerm('Kaffe  ')).toBe('kaffe');
    expect(normalizeTerm('  KAFFE')).toBe('kaffe');
    expect(normalizeTerm('kaffe   bönor')).toBe('kaffe bönor');
  });

  test('truncates rather than rejecting', () => {
    expect(normalizeTerm('a'.repeat(500))).toHaveLength(SEARCH_TERM_MAX);
  });
});

describe('logSearch', () => {
  test('the same term in three spellings lands as one stored term', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'Kaffe  ');
    await log(t, 'kaffe');
    await log(t, ' KAFFE ');

    const rows = await events(t);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.term))).toEqual(new Set(['kaffe']));
  });

  test('an empty or whitespace-only term inserts nothing', async () => {
    const t = convexTest(schema, modules);
    await log(t, '');
    await log(t, '   ');
    expect(await events(t)).toEqual([]);
  });

  test('a 500-character term stores 100 characters', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'a'.repeat(500));
    const [row] = await events(t);
    expect(row!.term).toHaveLength(SEARCH_TERM_MAX);
  });

  test('a client-supplied visitor and result count are bounded, not trusted', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'mjölk', { visitor: 'v'.repeat(200), results: -7.6 });
    const [row] = await events(t);
    expect(row!.visitor).toHaveLength(VISITOR_MAX);
    expect(row!.results).toBe(0);
  });

  test('an empty visitor is stored, because the row is still a real search', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'mjölk', { visitor: '' });
    const [row] = await events(t);
    expect(row!.visitor).toBe('');
  });

  test('a row older than the TTL is deleted by a later insert, a fresh one is not', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'gammal');

    // `_creationTime` is a system field and cannot be patched, so the clock
    // moves instead. Same effect on the handler's cutoff, no test-only branch
    // in the code being tested.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + SEARCH_LOG_TTL_MS + 60_000);
      await log(t, 'ny');

      const terms = (await events(t)).map((row) => row.term);
      expect(terms).toEqual(['ny']);
      expect(terms).not.toContain('gammal');
    } finally {
      vi.useRealTimers();
    }
  });

  test('a row inside the TTL survives the trim', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'gammal');
    await log(t, 'ny');

    const terms = (await events(t)).map((row) => row.term);
    expect(terms).toEqual(['gammal', 'ny']);
  });

  test('the stored row carries exactly term, visitor and results', async () => {
    const t = convexTest(schema, modules);
    await log(t, 'ost', { visitor: 'abc', results: 12 });
    const [row] = await events(t);
    const { _id, _creationTime, ...fields } = row!;
    expect(fields).toEqual({ term: 'ost', visitor: 'abc', results: 12 });
  });
});
