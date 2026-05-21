import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { requireAccountRead } from './model/auth';
import { receiptHeaderValidator, receiptItemDocValidator } from './validators';

// Public read API for stored receipts. Every handler is scoped to one account
// via the `requireAccountRead` seam. A query can't create an account, so an
// unknown subject yields `null` and the handler returns an empty result.

/** Drop `rawText` (can be large) from a stored receipt to make a header. */
function trim(doc: Doc<'receipts'>) {
  const { rawText: _rawText, ...header } = doc;
  return header;
}

/** Paginated receipt headers for one account, newest first. */
export const list = query({
  args: {
    subject: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(receiptHeaderValidator),
  handler: async (ctx, { subject, paginationOpts }) => {
    const accountId = await requireAccountRead(ctx, subject);
    if (accountId === null) {
      return { page: [], isDone: true, continueCursor: '' };
    }
    const result = await ctx.db
      .query('receipts')
      .withIndex('by_account', (q) => q.eq('accountId', accountId))
      .order('desc')
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(trim) };
  },
});

/** One receipt header plus its line items (ordered by on-receipt `lineNo`).
 * Returns `null` when the receipt is missing or owned by another account. */
export const getReceipt = query({
  args: { subject: v.optional(v.string()), receiptId: v.id('receipts') },
  returns: v.union(
    v.null(),
    v.object({
      receipt: receiptHeaderValidator,
      items: v.array(receiptItemDocValidator),
    }),
  ),
  handler: async (ctx, { subject, receiptId }) => {
    const [accountId, receipt] = await Promise.all([
      requireAccountRead(ctx, subject),
      ctx.db.get(receiptId),
    ]);
    // Ownership: never leak another account's row.
    if (accountId === null || receipt === null || receipt.accountId !== accountId) {
      return null;
    }
    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .order('asc') // `lineNo` is assigned in creation order, so _creationTime matches
      .take(1000); // bounded: a single receipt never has thousands of lines
    return { receipt: trim(receipt), items };
  },
});

/** Signed URL for a receipt's stored PDF, or `null` (missing PDF, or the
 * receipt is missing / owned by another account). The client fetches the
 * bytes directly from the returned URL — no Coop round-trip. */
export const getPdf = query({
  args: { subject: v.optional(v.string()), receiptId: v.id('receipts') },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { subject, receiptId }) => {
    const [accountId, receipt] = await Promise.all([
      requireAccountRead(ctx, subject),
      ctx.db.get(receiptId),
    ]);
    if (accountId === null || receipt === null || receipt.accountId !== accountId) {
      return null;
    }
    if (!receipt.pdfStorageId) return null;
    return await ctx.storage.getUrl(receipt.pdfStorageId);
  },
});

/** Incremental-pull cursor over `by_account`'s `_creationTime`. Reactive: a
 * subscribing client re-runs it and receives new receipts as they land; the
 * numeric `cursor` (pass back as `since`) also supports a plain polling client.
 * `since: 0` starts from the beginning. */
export const changes = query({
  args: {
    subject: v.optional(v.string()),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    receipts: v.array(receiptHeaderValidator),
    cursor: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, { subject, since, limit }) => {
    const accountId = await requireAccountRead(ctx, subject);
    const n = Math.min(limit ?? 100, 200);
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
    return { receipts: page.map(trim), cursor, hasMore };
  },
});
