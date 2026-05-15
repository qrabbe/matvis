import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import {
  receiptItemInsertValidator as receiptItem,
  storeObjectValidator as storeObject,
  storeValidator,
  vatLineValidator as vatLine,
} from '../validators';
import { requireAccountRead } from './auth';

// Registered DB helpers for the sync engine. They live here (default Convex
// runtime) — NOT in `convex/sync.ts` — so that action can be flipped to
// `"use node";` with a one-line change (a `"use node"` file may export only
// actions). The orchestration itself is in `../src/sync.ts`.
//
// The receipt-shape validators (store/vat/item) now live in `../validators.ts`
// so the public read API in `convex/receipts.ts` shares one source of truth.

/** Load the connection fields the sync action needs. `null` if it's gone. */
export const getConnectionForSync = internalQuery({
  args: {
    connectionId: v.id('connections'),
    subject: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.id('accounts'),
      store: storeValidator,
      accessToken: v.string(),
      accessTokenExpiresAt: v.number(),
      refreshToken: v.string(),
      status: v.union(
        v.literal('active'),
        v.literal('needs_reauth'),
        v.literal('revoked'),
      ),
    }),
  ),
  handler: async (ctx, { connectionId, subject }) => {
    const c = await ctx.db.get(connectionId);
    if (!c) return null;
    // Ownership check: only sync a connection the caller's account owns. Return
    // null for a foreign connection so it's indistinguishable from a missing one.
    const accountId = await requireAccountRead(ctx, subject);
    if (accountId === null || c.accountId !== accountId) return null;
    return {
      accountId: c.accountId,
      store: c.store,
      accessToken: c.accessToken,
      accessTokenExpiresAt: c.accessTokenExpiresAt,
      refreshToken: c.refreshToken,
      status: c.status,
    };
  },
});

/** True when a receipt with `externalId` already exists for the connection. */
export const receiptExists = internalQuery({
  args: { connectionId: v.id('connections'), externalId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { connectionId, externalId }) => {
    const hit = await ctx.db
      .query('receipts')
      .withIndex('by_connection_external', (q) =>
        q.eq('connectionId', connectionId).eq('externalId', externalId),
      )
      .unique();
    return hit !== null;
  },
});

/** Insert a receipt header plus its line items in one transaction. */
export const insertReceipt = internalMutation({
  args: {
    connectionId: v.id('connections'),
    accountId: v.id('accounts'),
    source: storeValidator,
    externalId: v.string(),
    schemaVersion: v.number(),
    store: storeObject,
    receiptNumber: v.optional(v.string()),
    purchasedAt: v.optional(v.string()),
    purchasedAtMs: v.optional(v.number()),
    currency: v.string(),
    total: v.optional(v.number()),
    itemCount: v.optional(v.number()),
    discountsTotal: v.optional(v.number()),
    pointsAmount: v.optional(v.number()),
    vat: v.array(vatLine),
    loyaltyCardId: v.optional(v.string()),
    pdfStorageId: v.optional(v.id('_storage')),
    rawText: v.optional(v.string()),
    items: v.array(receiptItem),
  },
  returns: v.id('receipts'),
  handler: async (ctx, args) => {
    const { items, ...header } = args;
    const receiptId = await ctx.db.insert('receipts', header);
    for (const [lineNo, it] of items.entries()) {
      await ctx.db.insert('receiptItems', {
        receiptId,
        lineNo,
        text: it.text,
        price: it.price,
        isDiscount: it.isDiscount,
        quantity: it.quantity,
        unit: it.unit,
        // `gtin` intentionally omitted — the matching pass fills it later.
      });
    }
    return receiptId;
  },
});

/** Persist a refreshed token set and reactivate the connection. */
export const applyRefreshedTokens = internalMutation({
  args: {
    connectionId: v.id('connections'),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, ...tokens }) => {
    await ctx.db.patch(connectionId, { ...tokens, status: 'active' });
    return null;
  },
});

/** Flag a connection as needing re-authentication (refresh failed). */
export const markNeedsReauth = internalMutation({
  args: { connectionId: v.id('connections') },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    await ctx.db.patch(connectionId, { status: 'needs_reauth' });
    return null;
  },
});

/** Stamp the connection's `lastSyncedAt` with the current time. */
export const touchLastSynced = internalMutation({
  args: { connectionId: v.id('connections') },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    await ctx.db.patch(connectionId, { lastSyncedAt: Date.now() });
    return null;
  },
});
