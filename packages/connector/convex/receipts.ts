import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { readScopedAccountId } from './model/auth';
import {
  MAX_RECEIPT_ITEMS,
  receiptHeaderValidator,
  receiptItemDocValidator,
} from './validators';

function toHeader(doc: Doc<'receipts'>) {
  const { rawText: _rawText, ...header } = doc;
  return header;
}

async function loadOwnedReceipt(
  ctx: QueryCtx,
  receiptId: Id<'receipts'>,
  token?: string,
): Promise<Doc<'receipts'> | null> {
  const [accountId, receipt] = await Promise.all([
    readScopedAccountId(ctx, token),
    ctx.db.get(receiptId),
  ]);
  if (
    accountId === null ||
    receipt === null ||
    receipt.accountId !== accountId
  ) {
    return null;
  }
  return receipt;
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    token: v.optional(v.string()),
  },
  returns: paginationResultValidator(receiptHeaderValidator),
  handler: async (ctx, { paginationOpts, token }) => {
    const accountId = await readScopedAccountId(ctx, token);
    if (accountId === null) {
      return { page: [], isDone: true, continueCursor: '' };
    }
    const result = await ctx.db
      .query('receipts')
      .withIndex('by_account', (q) => q.eq('accountId', accountId))
      .order('desc')
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(toHeader) };
  },
});

export const getReceipt = query({
  args: { receiptId: v.id('receipts'), token: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({
      receipt: receiptHeaderValidator,
      items: v.array(receiptItemDocValidator),
    }),
  ),
  handler: async (ctx, { receiptId, token }) => {
    const receipt = await loadOwnedReceipt(ctx, receiptId, token);
    if (receipt === null) return null;
    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      // `lineNo` is assigned in creation order, so `_creationTime` orders by it.
      .order('asc')
      .take(MAX_RECEIPT_ITEMS);
    return { receipt: toHeader(receipt), items };
  },
});

export const getPdf = query({
  args: { receiptId: v.id('receipts'), token: v.optional(v.string()) },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { receiptId, token }) => {
    const receipt = await loadOwnedReceipt(ctx, receiptId, token);
    if (receipt === null || !receipt.pdfStorageId) return null;
    return await ctx.storage.getUrl(receipt.pdfStorageId);
  },
});

export const changes = query({
  args: {
    since: v.number(),
    limit: v.optional(v.number()),
    token: v.optional(v.string()),
  },
  returns: v.object({
    receipts: v.array(receiptHeaderValidator),
    cursor: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, { since, limit, token }) => {
    const accountId = await readScopedAccountId(ctx, token);
    const n = Math.min(limit ?? 50, 100);
    if (accountId === null) {
      return { receipts: [], cursor: since, hasMore: false };
    }
    const rows = await ctx.db
      .query('receipts')
      .withIndex('by_account', (q) =>
        q.eq('accountId', accountId).gt('_creationTime', since),
      )
      .order('asc')
      .take(n + 1);
    const hasMore = rows.length > n;
    const page = rows.slice(0, n);
    const cursor = page.length ? page[page.length - 1]._creationTime : since;
    return { receipts: page.map(toHeader), cursor, hasMore };
  },
});
