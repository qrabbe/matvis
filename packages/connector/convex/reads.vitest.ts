/// <reference types="vite/client" />
import { countReads, handlerOf, rangesOn } from '@matvis/shared/testing';
import type { ReadCounts } from '@matvis/shared/testing';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import * as crons from './crons';
import * as receipts from './receipts';
import schema from './schema';
import { MAX_RECEIPT_ITEMS, SYNC_BATCH_LIMIT } from './validators';

const modules = import.meta.glob('./**/*.ts');

type Test = ReturnType<ReturnType<typeof convexTest>['withIdentity']>;

async function countQuery(
  t: Test,
  read: (ctx: QueryCtx) => Promise<unknown>,
): Promise<ReadCounts> {
  const measured = async (ctx: QueryCtx) => {
    const counted = countReads(ctx);
    await read(counted.ctx);
    return counted.counts;
  };
  return await t.query(measured);
}

async function countMutation(
  t: Test,
  write: (ctx: MutationCtx) => Promise<unknown>,
): Promise<ReadCounts> {
  const measured = async (ctx: MutationCtx) => {
    const counted = countReads(ctx);
    await write(counted.ctx);
    return counted.counts;
  };
  return await t.mutation(measured);
}

const sealed = { keyVersion: 1, iv: 'aXY=', ciphertext: 'Y3Q=' };

async function seedReceipts(
  t: ReturnType<typeof convexTest>,
  receiptCount: number,
  items: number,
) {
  return await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', { subject: 'sub-a' });
    const connectionId = await ctx.db.insert('connections', {
      accountId,
      store: 'coop',
      accessToken: sealed,
      accessTokenExpiresAt: 0,
      refreshToken: sealed,
      status: 'active' as const,
    });
    let receiptId: Id<'receipts'> | null = null;
    for (let n = 0; n < receiptCount; n += 1) {
      receiptId = await ctx.db.insert('receipts', {
        connectionId,
        accountId,
        source: 'coop',
        externalId: `a-${n}`,
        store: { name: 'Stora Coop' },
        currency: 'SEK',
        vat: [],
      });
    }
    for (let lineNo = 0; lineNo < items; lineNo += 1) {
      await ctx.db.insert('receiptItems', {
        receiptId: receiptId!,
        lineNo,
        text: `MJÖLK ${lineNo}`,
        price: 12.5,
        isDiscount: false,
      });
    }
    return receiptId!;
  });
}

const as = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

describe('receipts.list', () => {
  test('pages the index and never touches receiptItems', async () => {
    const t = convexTest(schema, modules);
    await seedReceipts(t, 5, 3);

    const counts = await countQuery(as(t, 'sub-a'), (ctx) =>
      handlerOf(receipts.list)(ctx, {
        paginationOpts: { numItems: 3, cursor: null },
      }),
    );

    expect(rangesOn(counts, 'receiptItems')).toEqual([]);
    expect(counts.ranges).toEqual([
      { table: 'accounts', kind: 'index', index: 'by_subject' },
      { table: 'receipts', kind: 'index', index: 'by_account' },
    ]);
    expect(counts.gets).toBe(0);
    expect(counts.docs).toBe(1 + 3);
  });
});

describe('receipts.getReceipt', () => {
  test('reads its items through by_receipt, bounded by MAX_RECEIPT_ITEMS', async () => {
    const t = convexTest(schema, modules);
    const receiptId = await seedReceipts(t, 1, MAX_RECEIPT_ITEMS + 5);

    const counts = await countQuery(as(t, 'sub-a'), (ctx) =>
      handlerOf(receipts.getReceipt)(ctx, { receiptId }),
    );

    expect(counts.ranges).toEqual([
      { table: 'accounts', kind: 'index', index: 'by_subject' },
      { table: 'receiptItems', kind: 'index', index: 'by_receipt' },
    ]);
    expect(counts.gets).toBe(1);
    expect(counts.docs).toBe(1 + 1 + MAX_RECEIPT_ITEMS);
  });
});

describe('crons.dispatchSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function seedConnections(
    t: ReturnType<typeof convexTest>,
    total: number,
    stale: number,
  ) {
    await t.run(async (ctx) => {
      const accountId = await ctx.db.insert('accounts', { subject: 'sub-a' });
      for (let n = 0; n < total; n += 1) {
        await ctx.db.insert('connections', {
          accountId,
          store: 'coop',
          accessToken: sealed,
          accessTokenExpiresAt: 0,
          refreshToken: sealed,
          status: 'active' as const,
          lastSyncedAt: n < stale ? n : Date.now(),
        });
      }
    });
  }

  test('reads one batch of connections, never the whole table', async () => {
    const t = convexTest(schema, modules);
    const total = SYNC_BATCH_LIMIT + 10;
    await seedConnections(t, total, total);

    const counts = await countMutation(t, (ctx) =>
      handlerOf(crons.dispatchSync)(ctx, {}),
    );
    expect(counts.ranges).toEqual([
      { table: 'connections', kind: 'index', index: 'by_status_last_synced' },
    ]);
    expect(counts.docs).toBe(SYNC_BATCH_LIMIT);
    expect(counts.gets).toBe(0);
  });

  test('stops at the first fresh connection rather than filtering the batch', async () => {
    const t = convexTest(schema, modules);
    await seedConnections(t, SYNC_BATCH_LIMIT + 10, 2);

    const counts = await countMutation(t, async (ctx) => {
      const result = await handlerOf(crons.dispatchSync)(ctx, {});
      expect(result).toEqual({
        scheduled: 2,
        skipped: SYNC_BATCH_LIMIT - 2,
        paused: false,
      });
      return result;
    });
    expect(counts.ranges).toHaveLength(1);
    expect(counts.docs).toBe(SYNC_BATCH_LIMIT);
  });
});
