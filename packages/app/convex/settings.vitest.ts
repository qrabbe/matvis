/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('get', () => {
  test('is all-untouched for an account that never set anything', async () => {
    const t = convexTest(schema, modules);
    const { targets } = await t.query(api.settings.get, { token: 'tok_a' });
    expect(targets).toEqual({
      energy: undefined,
      protein: undefined,
      fat: undefined,
      carbs: undefined,
      fiber: undefined,
      saturatedFat: undefined,
      salt: undefined,
    });
  });

  test('is scoped to the caller’s own token', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.settings.setTargets, {
      token: 'tok_a',
      targets: { protein: 150 },
    });
    const { targets } = await t.query(api.settings.get, { token: 'tok_b' });
    expect(targets.protein).toBeUndefined();
  });
});

describe('setTargets', () => {
  test('round-trips a custom value', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.settings.setTargets, {
      token: 'tok_a',
      targets: { protein: 150 },
    });
    const { targets } = await t.query(api.settings.get, { token: 'tok_a' });
    expect(targets.protein).toBe(150);
  });

  test('round-trips a disabled target as null', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.settings.setTargets, {
      token: 'tok_a',
      targets: { salt: null },
    });
    const { targets } = await t.query(api.settings.get, { token: 'tok_a' });
    expect(targets.salt).toBeNull();
  });

  test('merges rather than overwriting other targets', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.settings.setTargets, {
      token: 'tok_a',
      targets: { protein: 150 },
    });
    await t.mutation(api.settings.setTargets, {
      token: 'tok_a',
      targets: { salt: null },
    });
    const { targets } = await t.query(api.settings.get, { token: 'tok_a' });
    expect(targets.protein).toBe(150);
    expect(targets.salt).toBeNull();
  });
});
