/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

// Seed one receipt with three lines: a plain item, a discount, and an item whose
// text carries price + quantity noise.
async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', { subject: 'sub-a' });
    const sealed = { keyVersion: 1, iv: 'aXY=', ciphertext: 'Y3Q=' };
    const connectionId = await ctx.db.insert('connections', {
      accountId,
      store: 'coop',
      accessToken: sealed,
      accessTokenExpiresAt: 0,
      refreshToken: sealed,
      status: 'active' as const,
    });
    const receiptId = await ctx.db.insert('receipts', {
      connectionId,
      accountId,
      source: 'coop',
      externalId: 'a-1',
      store: { name: 'Stora Coop' },
      currency: 'SEK',
      vat: [],
    });
    const items = await Promise.all([
      ctx.db.insert('receiptItems', {
        receiptId,
        lineNo: 0,
        text: 'MJÖLK 12,50',
        price: 12.5,
        isDiscount: false,
      }),
      ctx.db.insert('receiptItems', {
        receiptId,
        lineNo: 1,
        text: 'RABATT -5,00',
        price: -5,
        isDiscount: true,
      }),
      ctx.db.insert('receiptItems', {
        receiptId,
        lineNo: 2,
        text: 'BANAN 0,254 KG',
        price: 6,
        isDiscount: false,
      }),
    ]);
    return { receiptId, items };
  });
}

// `null` for an unmatched line: an absent field crosses the `t.run` boundary as
// null, not undefined.
const gtinOf = (t: ReturnType<typeof convexTest>, id: Id<'receiptItems'>) =>
  t.run(async (ctx) => (await ctx.db.get(id))?.gtin ?? null);

describe('matchReceipt', () => {
  test('is a no-op with an empty map', async () => {
    const t = convexTest(schema, modules);
    const { receiptId, items } = await seed(t);
    const matched = await t.mutation(internal.matching.matchReceipt, {
      receiptId,
    });
    expect(matched).toBe(0);
    for (const id of items) expect(await gtinOf(t, id)).toBeNull();
  });

  test('patches gtin on lines whose normalized text is mapped', async () => {
    const t = convexTest(schema, modules);
    const { receiptId, items } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('itemGtinMap', {
        store: 'coop',
        normalizedText: 'mjölk',
        gtin: '7310865004703',
      });
    });
    const matched = await t.mutation(internal.matching.matchReceipt, {
      receiptId,
    });
    expect(matched).toBe(1);
    expect(await gtinOf(t, items[0])).toBe('7310865004703');
    expect(await gtinOf(t, items[2])).toBeNull();
  });

  test('leaves an already-matched line alone and skips discounts', async () => {
    const t = convexTest(schema, modules);
    const { receiptId, items } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(items[0], { gtin: 'already' });
      await ctx.db.insert('itemGtinMap', {
        store: 'coop',
        normalizedText: 'mjölk',
        gtin: '7310865004703',
      });
      await ctx.db.insert('itemGtinMap', {
        store: 'coop',
        normalizedText: 'rabatt',
        gtin: 'should-not-be-used',
      });
    });
    const matched = await t.mutation(internal.matching.matchReceipt, {
      receiptId,
    });
    expect(matched).toBe(0);
    expect(await gtinOf(t, items[0])).toBe('already');
    expect(await gtinOf(t, items[1])).toBeNull();
  });

  test('insertReceipt schedules the matcher', async () => {
    // The matcher runs via `scheduler.runAfter`, so drive it off fake timers.
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { receiptId } = await seed(t);
    const receipt = await t.run(async (ctx) => await ctx.db.get(receiptId));
    await t.run(async (ctx) => {
      await ctx.db.insert('itemGtinMap', {
        store: 'coop',
        normalizedText: 'mjölk',
        gtin: '7310865004703',
      });
    });
    const { connectionId, accountId, _id, _creationTime, ...content } =
      receipt!;
    const newId = await t.mutation(internal.model.receipts.insertReceipt, {
      ...content,
      externalId: 'a-2',
      connectionId,
      accountId,
      items: [{ text: 'MJÖLK 12,50', price: 12.5, isDiscount: false }],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const gtin = await t.run(async (ctx) => {
      const [item] = await ctx.db
        .query('receiptItems')
        .withIndex('by_receipt', (q) => q.eq('receiptId', newId))
        .collect();
      return item?.gtin;
    });
    expect(gtin).toBe('7310865004703');
    vi.useRealTimers();
  });
});
