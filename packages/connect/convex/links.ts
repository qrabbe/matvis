import { v } from 'convex/values';
import { pollBankId, startBankId } from '../src/coop/auth/bankid';
import { defaultFetch } from '../src/http';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery } from './_generated/server';
import { getOrCreateAccount } from './model/accounts';
import { storeValidator } from './validators';

// ── AUTH SEAM ─────────────────────────────────────────────────────────────
// `subject` identifies the connector account. For now it's supplied by the
// caller (dev only — no auth yet, so any caller can act as any account). When
// service auth lands, `subject` MUST instead come from
// ctx.auth.getUserIdentity() and this argument be removed; `poll` must verify
// the pending link belongs to the caller's account. Account resolution is kept
// in one place (getOrCreateAccount) to make that swap local.

/** Begin a BankID link for a store under the caller's connector account. */
export const start = action({
  args: { subject: v.string(), store: storeValidator },
  returns: v.object({
    pendingLinkId: v.id('pendingLinks'),
    orderRef: v.string(),
    autoStartToken: v.optional(v.string()),
  }),
  handler: async (ctx, { subject, store }) => {
    const started = await startBankId(defaultFetch);
    const pendingLinkId: Id<'pendingLinks'> = await ctx.runMutation(
      internal.links.createPendingLink,
      { subject, store, orderRef: started.orderRef },
    );
    return {
      pendingLinkId,
      orderRef: started.orderRef,
      autoStartToken: started.autoStartToken,
    };
  },
});

/** Poll a pending link once. Render the QR while `pending`. */
export const poll = action({
  args: { pendingLinkId: v.id('pendingLinks') },
  returns: v.union(
    v.object({ status: v.literal('pending'), qrCode: v.optional(v.string()) }),
    v.object({
      status: v.literal('complete'),
      connectionId: v.id('connections'),
    }),
    v.object({ status: v.literal('failed'), error: v.optional(v.string()) }),
  ),
  handler: async (ctx, { pendingLinkId }) => {
    const link: Doc<'pendingLinks'> | null = await ctx.runQuery(
      internal.links.getPendingLink,
      { pendingLinkId },
    );
    if (!link) return { status: 'failed' as const, error: 'unknown pending link' };

    const result = await pollBankId(defaultFetch, link.orderRef);
    if (result.status === 'pending') {
      return { status: 'pending' as const, qrCode: result.qrCode };
    }
    if (result.status === 'failed') {
      await ctx.runMutation(internal.links.failLink, {
        pendingLinkId,
        error: result.error,
      });
      return { status: 'failed' as const, error: result.error };
    }
    const connectionId: Id<'connections'> = await ctx.runMutation(
      internal.links.finishLink,
      {
        pendingLinkId,
        tokens: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresAt: result.tokens.expiresAt,
        },
      },
    );
    return { status: 'complete' as const, connectionId };
  },
});

// ── Internal DB effects ─────────────────────────────────────────────────────

export const createPendingLink = internalMutation({
  args: { subject: v.string(), store: storeValidator, orderRef: v.string() },
  returns: v.id('pendingLinks'),
  handler: async (ctx, { subject, store, orderRef }) => {
    const accountId = await getOrCreateAccount(ctx, subject);
    return await ctx.db.insert('pendingLinks', {
      accountId,
      store,
      orderRef,
      status: 'pending',
    });
  },
});

export const getPendingLink = internalQuery({
  args: { pendingLinkId: v.id('pendingLinks') },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('pendingLinks'),
      _creationTime: v.number(),
      accountId: v.id('accounts'),
      store: storeValidator,
      orderRef: v.string(),
      status: v.union(
        v.literal('pending'),
        v.literal('complete'),
        v.literal('failed'),
      ),
    }),
  ),
  handler: async (ctx, { pendingLinkId }) => {
    return await ctx.db.get(pendingLinkId);
  },
});

export const finishLink = internalMutation({
  args: {
    pendingLinkId: v.id('pendingLinks'),
    tokens: v.object({
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(), // epoch ms
    }),
  },
  returns: v.id('connections'),
  handler: async (ctx, { pendingLinkId, tokens }) => {
    const link = await ctx.db.get(pendingLinkId);
    if (!link) throw new Error('pending link not found');

    // Upsert the (account, store) connection: refresh tokens if one exists,
    // otherwise create it. Kept in the mutation so it's transactional.
    const existing = (
      await ctx.db
        .query('connections')
        .withIndex('by_account', (q) => q.eq('accountId', link.accountId))
        .collect()
    ).find((c) => c.store === link.store);

    const tokenFields = {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.expiresAt,
      refreshToken: tokens.refreshToken,
      status: 'active' as const,
    };

    let connectionId: Id<'connections'>;
    if (existing) {
      await ctx.db.patch(existing._id, tokenFields);
      connectionId = existing._id;
    } else {
      connectionId = await ctx.db.insert('connections', {
        accountId: link.accountId,
        store: link.store,
        ...tokenFields,
      });
    }

    await ctx.db.patch(pendingLinkId, { status: 'complete' });
    return connectionId;
  },
});

export const failLink = internalMutation({
  // `error` is accepted for future logging; not persisted (no field for it).
  args: { pendingLinkId: v.id('pendingLinks'), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { pendingLinkId }) => {
    await ctx.db.patch(pendingLinkId, { status: 'failed' });
    return null;
  },
});
