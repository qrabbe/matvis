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

// Public read API for stored receipts. Every handler is scoped to one account,
// resolved either from an explicit API `token` (the decoupled third-party path,
// no login needed) or, when no token is passed, from the caller's login session
// (the portal's own reads). An unresolved account yields an empty result.

/** Drop `rawText` (can be large) from a stored receipt to make a header. */
function toHeader(doc: Doc<'receipts'>) {
  const { rawText: _rawText, ...header } = doc;
  return header;
}

/** Load a receipt the caller owns, or `null` when it's missing or owned by
 * another account. The account lookup and the fetch run concurrently. */
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

/** Paginated receipt headers for one account, newest first. */
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

/** One receipt header plus its line items (ordered by on-receipt `lineNo`).
 * Returns `null` when the receipt is missing or owned by another account. */
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
      .order('asc') // `lineNo` is assigned in creation order, so _creationTime matches
      .take(MAX_RECEIPT_ITEMS);
    return { receipt: toHeader(receipt), items };
  },
});

/** Signed URL for a receipt's stored PDF, or `null` */
export const getPdf = query({
  args: { receiptId: v.id('receipts'), token: v.optional(v.string()) },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { receiptId, token }) => {
    const receipt = await loadOwnedReceipt(ctx, receiptId, token);
    if (receipt === null || !receipt.pdfStorageId) return null;
    return await ctx.storage.getUrl(receipt.pdfStorageId);
  },
});

/** Incremental-pull cursor over `by_account`'s `_creationTime`. Reactive: a
 * subscribing client re-runs it and receives new receipts as they land; the
 * numeric `cursor` (pass back as `since`) also supports a plain polling client.
 * `since: 0` starts from the beginning. */
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
    // Default well below the ceiling: this is a reactive endpoint, so a client
    // that omits `limit` holds a subscription that re-reads a full page on every
    // write in range. A caller that genuinely wants more still asks for it.
    const n = Math.min(limit ?? 50, 100);
    if (accountId === null) {
      return { receipts: [], cursor: since, hasMore: false };
    }
    // `_creationTime` is appended to every index, so `by_account` is
    // effectively [accountId, _creationTime] — `.gt('_creationTime', since)`
    // is a valid index range predicate after `.eq('accountId', …)`.
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
