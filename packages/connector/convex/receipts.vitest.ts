/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

// Bind a test client to an account. `subject` is what the auth seam reads (via
// getAuthUserId in model/auth.ts), and it matches the seeded `accounts.subject`.
const as = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

// Seed two accounts (A, B). Account A gets three receipts (a-1, a-2, a-3 in
// creation order — a-3 newest), a-3 carrying two line items and a stored PDF.
// Account B gets one receipt (b-1) to exercise cross-account scoping/ownership.
async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const accountA = await ctx.db.insert('accounts', { subject: 'sub-a' });
    const accountB = await ctx.db.insert('accounts', { subject: 'sub-b' });
    // Token columns hold ciphertext. These tests never decrypt, so a stand-in
    // blob of the right shape is enough.
    const sealed = { keyVersion: 1, iv: 'aXY=', ciphertext: 'Y3Q=' };
    const conn = (accountId: typeof accountA) =>
      ctx.db.insert('connections', {
        accountId,
        store: 'coop',
        accessToken: sealed,
        accessTokenExpiresAt: 0,
        refreshToken: sealed,
        status: 'active' as const,
      });
    const connA = await conn(accountA);
    const connB = await conn(accountB);
    const mk = (
      accountId: typeof accountA,
      connectionId: typeof connA,
      externalId: string,
      extra: {
        pdfStorageId?: Awaited<ReturnType<typeof ctx.storage.store>>;
      } = {},
    ) =>
      ctx.db.insert('receipts', {
        connectionId,
        accountId,
        source: 'coop',
        externalId,
        schemaVersion: 1,
        store: { name: 'Stora Coop' },
        currency: 'SEK',
        vat: [],
        ...extra,
      });
    const r1 = await mk(accountA, connA, 'a-1');
    const r2 = await mk(accountA, connA, 'a-2');
    const pdfStorageId = await ctx.storage.store(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
    );
    const r3 = await mk(accountA, connA, 'a-3', { pdfStorageId });
    await ctx.db.insert('receiptItems', {
      receiptId: r3,
      lineNo: 0,
      text: 'MJÖLK',
      price: 12.5,
      isDiscount: false,
    });
    await ctx.db.insert('receiptItems', {
      receiptId: r3,
      lineNo: 1,
      text: 'RABATT',
      price: -5,
      isDiscount: true,
    });
    const rb = await mk(accountB, connB, 'b-1');
    return { r1, r2, r3, rb };
  });
}

describe('receipts read API', () => {
  test('list paginates one account newest-first, trimmed', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const page = await as(t, 'sub-a').query(api.receipts.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((r) => r.externalId)).toEqual(['a-3', 'a-2', 'a-1']);
    // scoped to A — B's receipt never appears
    expect(page.page.some((r) => r.externalId === 'b-1')).toBe(false);
    // header is trimmed (no rawText)
    expect(page.page.every((r) => !('rawText' in r))).toBe(true);
  });

  test('unknown account yields an empty page', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const page = await as(t, 'nobody').query(api.receipts.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toEqual([]);
    expect(page.isDone).toBe(true);
  });

  test('changes returns all from since:0 then nothing at the cursor', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await as(t, 'sub-a').query(api.receipts.changes, {
      since: 0,
    });
    expect(first.receipts.map((r) => r.externalId)).toEqual([
      'a-1',
      'a-2',
      'a-3',
    ]);
    expect(first.hasMore).toBe(false);
    const second = await as(t, 'sub-a').query(api.receipts.changes, {
      since: first.cursor,
    });
    expect(second.receipts).toEqual([]);
    expect(second.hasMore).toBe(false);
    expect(second.cursor).toBe(first.cursor);
  });

  test('changes honors limit and reports hasMore', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await as(t, 'sub-a').query(api.receipts.changes, {
      since: 0,
      limit: 2,
    });
    expect(first.receipts.map((r) => r.externalId)).toEqual(['a-1', 'a-2']);
    expect(first.hasMore).toBe(true);
    const rest = await as(t, 'sub-a').query(api.receipts.changes, {
      since: first.cursor,
      limit: 2,
    });
    expect(rest.receipts.map((r) => r.externalId)).toEqual(['a-3']);
    expect(rest.hasMore).toBe(false);
  });

  test('getReceipt returns header + items in lineNo order for the owner', async () => {
    const t = convexTest(schema, modules);
    const { r3 } = await seed(t);
    const got = await as(t, 'sub-a').query(api.receipts.getReceipt, {
      receiptId: r3,
    });
    expect(got?.receipt.externalId).toBe('a-3');
    expect(got?.items.map((i) => i.text)).toEqual(['MJÖLK', 'RABATT']);
  });

  test('getReceipt does not leak another account row', async () => {
    const t = convexTest(schema, modules);
    const { r3 } = await seed(t);
    const cross = await as(t, 'sub-b').query(api.receipts.getReceipt, {
      receiptId: r3,
    });
    expect(cross).toBeNull();
  });

  test('getReceipt and getPdf are null for a receipt that is gone', async () => {
    const t = convexTest(schema, modules);
    const { r3 } = await seed(t);
    await t.run(async (ctx) => await ctx.db.delete(r3));
    const got = await as(t, 'sub-a').query(api.receipts.getReceipt, {
      receiptId: r3,
    });
    expect(got).toBeNull();
    const url = await as(t, 'sub-a').query(api.receipts.getPdf, {
      receiptId: r3,
    });
    expect(url).toBeNull();
  });

  test('getPdf: signed URL for owner, null cross-account, null when no PDF', async () => {
    const t = convexTest(schema, modules);
    const { r1, r3 } = await seed(t);
    const url = await as(t, 'sub-a').query(api.receipts.getPdf, {
      receiptId: r3,
    });
    expect(typeof url).toBe('string');
    const cross = await as(t, 'sub-b').query(api.receipts.getPdf, {
      receiptId: r3,
    });
    expect(cross).toBeNull();
    const noPdf = await as(t, 'sub-a').query(api.receipts.getPdf, {
      receiptId: r1,
    });
    expect(noPdf).toBeNull();
  });
});
