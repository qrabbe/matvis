/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('upsert', () => {
  test('inserts new rows and reports the count', async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.durationEstimates.upsert, {
      estimates: [
        {
          groupKey: 'product:111',
          label: 'Mjölk',
          daysToFinish: 3,
          source: 'seed',
        },
        {
          groupKey: 'produce:tomat',
          label: 'Tomat',
          daysToFinish: 5,
          source: 'seed',
        },
      ],
    });
    expect(result).toEqual({ inserted: 2, updated: 0 });

    const rows = await t.query(api.durationEstimates.list, {});
    expect(rows).toHaveLength(2);
  });

  test('re-running updates existing rows by groupKey instead of duplicating', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.durationEstimates.upsert, {
      estimates: [
        {
          groupKey: 'product:111',
          label: 'Mjölk',
          daysToFinish: 3,
          source: 'seed',
        },
      ],
    });
    const second = await t.mutation(internal.durationEstimates.upsert, {
      estimates: [
        {
          groupKey: 'product:111',
          label: 'Mjölk',
          daysToFinish: 4,
          source: 'rerun',
        },
      ],
    });
    expect(second).toEqual({ inserted: 0, updated: 1 });

    const rows = await t.query(api.durationEstimates.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ daysToFinish: 4, source: 'rerun' });
  });
});
