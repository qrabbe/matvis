import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, internalQuery } from '../_generated/server';
import {
  connectionStatusValidator,
  encryptedSecretValidator,
  receiptContentFields,
  receiptItemInsertValidator as receiptItem,
  storeValidator,
} from '../validators';
import { readAccountId } from './auth';

// Registered DB helpers for the sync engine. They live here in the default
// Convex runtime because the `"use node"` `convex/sync.ts` may export only
// actions. The orchestration itself is in `../src/sync.ts`.

/** Load the connection fields the sync action needs. `null` if it's gone. The
 * tokens stay encrypted here. Only the action decrypts them. */
export const getConnectionForSync = internalQuery({
  args: { connectionId: v.id('connections') },
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.id('accounts'),
      store: storeValidator,
      accessToken: encryptedSecretValidator,
      accessTokenExpiresAt: v.number(),
      refreshToken: encryptedSecretValidator,
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { connectionId }) => {
    const c = await ctx.db.get(connectionId);
    if (!c) return null;
    // Ownership: return null for a foreign connection so it's indistinguishable
    // from a missing one.
    const accountId = await readAccountId(ctx);
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
    ...receiptContentFields,
    rawText: v.optional(v.string()),
    items: v.array(receiptItem),
  },
  returns: v.id('receipts'),
  handler: async (ctx, args) => {
    const { items, ...header } = args;
    const receiptId = await ctx.db.insert('receipts', header);
    // `gtin` is omitted — filled by the later matching pass.
    await Promise.all(
      items.map((it, lineNo) =>
        ctx.db.insert('receiptItems', {
          receiptId,
          lineNo,
          text: it.text,
          price: it.price,
          isDiscount: it.isDiscount,
          quantity: it.quantity,
          unit: it.unit,
        }),
      ),
    );
    // Matching runs as its own step, right after the insert commits. Wiring it
    // here (rather than in the sync action) keeps every insert path covered and
    // means the future engine needs no change to sync.
    await ctx.scheduler.runAfter(0, internal.matching.matchReceipt, {
      receiptId,
    });
    return receiptId;
  },
});

/** Persist a refreshed token set and reactivate the connection. The tokens
 * arrive already encrypted from the sync action. */
export const applyRefreshedTokens = internalMutation({
  args: {
    connectionId: v.id('connections'),
    accessToken: encryptedSecretValidator,
    accessTokenExpiresAt: v.number(),
    refreshToken: encryptedSecretValidator,
    refreshTokenExpiresAt: v.optional(v.number()),
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
