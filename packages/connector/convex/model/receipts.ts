import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { internalMutation, internalQuery } from '../_generated/server';
import {
  connectionStatusValidator,
  encryptedSecretValidator,
  receiptContentFields,
  receiptItemInsertValidator as receiptItem,
  storeValidator,
} from '../validators';
import { readAccountId } from './auth';

const connectionForSyncValidator = v.union(
  v.null(),
  v.object({
    accountId: v.id('accounts'),
    store: storeValidator,
    accessToken: encryptedSecretValidator,
    accessTokenExpiresAt: v.number(),
    refreshToken: encryptedSecretValidator,
    status: connectionStatusValidator,
  }),
);

function connectionForSync(c: Doc<'connections'>) {
  return {
    accountId: c.accountId,
    store: c.store,
    accessToken: c.accessToken,
    accessTokenExpiresAt: c.accessTokenExpiresAt,
    refreshToken: c.refreshToken,
    status: c.status,
  };
}

export const getConnectionForSync = internalQuery({
  args: { connectionId: v.id('connections') },
  returns: connectionForSyncValidator,
  handler: async (ctx, { connectionId }) => {
    const c = await ctx.db.get(connectionId);
    if (!c) return null;
    const accountId = await readAccountId(ctx);
    if (accountId === null || c.accountId !== accountId) return null;
    return connectionForSync(c);
  },
});

export const getConnectionForScheduledSync = internalQuery({
  args: { connectionId: v.id('connections') },
  returns: connectionForSyncValidator,
  handler: async (ctx, { connectionId }) => {
    const c = await ctx.db.get(connectionId);
    return c ? connectionForSync(c) : null;
  },
});

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
    await ctx.scheduler.runAfter(0, internal.matching.matchReceipt, {
      receiptId,
    });
    return receiptId;
  },
});

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

export const markNeedsReauth = internalMutation({
  args: { connectionId: v.id('connections') },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    await ctx.db.patch(connectionId, { status: 'needs_reauth' });
    return null;
  },
});

export const touchLastSynced = internalMutation({
  args: { connectionId: v.id('connections') },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    await ctx.db.patch(connectionId, { lastSyncedAt: Date.now() });
    return null;
  },
});
