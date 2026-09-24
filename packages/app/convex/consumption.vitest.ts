/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('logConsumption', () => {
  test('records an event and lists it back for the same token', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.consumption.logConsumption, {
      token: 'tok_a',
      ean: '111',
      quantity: 1,
      consumedAt: Date.now(),
    });

    const events = await t.query(api.consumption.listConsumption, {
      token: 'tok_a',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.ean).toBe('111');
  });

  test('scopes events to their own token', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.consumption.logConsumption, {
      token: 'tok_a',
      ean: '111',
      quantity: 1,
      consumedAt: Date.now(),
    });

    const events = await t.query(api.consumption.listConsumption, {
      token: 'tok_b',
    });
    expect(events).toEqual([]);
  });

  test('rejects a non-positive quantity', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.consumption.logConsumption, {
        token: 'tok_a',
        ean: '111',
        quantity: 0,
        consumedAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test('rejects a consumedAt far in the future', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.consumption.logConsumption, {
        token: 'tok_a',
        ean: '111',
        quantity: 1,
        consumedAt: Date.now() + 7 * 86_400_000,
      }),
    ).rejects.toThrow();
  });
});

describe('deleteConsumption', () => {
  test('removes an event owned by the caller', async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.mutation(api.consumption.logConsumption, {
      token: 'tok_a',
      ean: '111',
      quantity: 1,
      consumedAt: Date.now(),
    });

    await t.mutation(api.consumption.deleteConsumption, {
      token: 'tok_a',
      eventId,
    });

    const events = await t.query(api.consumption.listConsumption, {
      token: 'tok_a',
    });
    expect(events).toEqual([]);
  });

  test('does nothing for an event owned by a different token', async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.mutation(api.consumption.logConsumption, {
      token: 'tok_a',
      ean: '111',
      quantity: 1,
      consumedAt: Date.now(),
    });

    await t.mutation(api.consumption.deleteConsumption, {
      token: 'tok_b',
      eventId,
    });

    const events = await t.query(api.consumption.listConsumption, {
      token: 'tok_a',
    });
    expect(events).toHaveLength(1);
  });
});

describe('setExcluded', () => {
  test('creates then updates a preference for the same product', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.consumption.setExcluded, {
      token: 'tok_a',
      ean: '111',
      excluded: true,
    });
    await t.mutation(api.consumption.setExcluded, {
      token: 'tok_a',
      ean: '111',
      excluded: false,
    });

    const preferences = await t.query(api.consumption.listPreferences, {
      token: 'tok_a',
    });
    expect(preferences).toEqual([{ ean: '111', excluded: false }]);
  });
});

describe('exportAll', () => {
  test('returns both tables for the token, and nothing else', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.consumption.logConsumption, {
      token: 'tok_a',
      ean: '111',
      quantity: 2,
      consumedAt: Date.now(),
    });
    await t.mutation(api.consumption.setExcluded, {
      token: 'tok_a',
      ean: '222',
      excluded: true,
    });
    await t.mutation(api.consumption.logConsumption, {
      token: 'tok_b',
      ean: '999',
      quantity: 1,
      consumedAt: Date.now(),
    });

    const exported = await t.query(api.consumption.exportAll, {
      token: 'tok_a',
    });
    expect(exported.consumptionEvents).toHaveLength(1);
    expect(exported.consumptionEvents[0]?.ean).toBe('111');
    expect(exported.productPreferences).toEqual([
      { ean: '222', excluded: true },
    ]);
  });
});
