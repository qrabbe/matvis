import { v } from 'convex/values';
import { encryptTokenPair } from '../src/crypto';
import { defaultFetch } from '../src/http';
import { getConnector } from '../src/registry';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery } from './_generated/server';
import { getOrCreateAccountId, readAccountId } from './model/auth';
import {
  encryptedSecretValidator,
  pendingLinkStatusValidator,
  storeValidator,
} from './validators';

// Every entry point resolves the caller's account through the `model/auth` seam,
// and the store's connector through the `src/registry` seam — so a new chain is
// a registry entry, not an edit here.

/** Begin a BankID link for a store under the caller's connector account. */
export const start = action({
  args: {
    store: storeValidator,
    // `true` = same-device flow (autoStartToken for a bankid:// deep link);
    // default/`false` = cross-device flow (poll yields a QR to scan).
    sameDevice: v.optional(v.boolean()),
  },
  returns: v.object({
    pendingLinkId: v.id('pendingLinks'),
    orderRef: v.string(),
    autoStartToken: v.optional(v.string()),
  }),
  handler: async (ctx, { store, sameDevice }) => {
    const connector = getConnector(store, { fetch: defaultFetch });
    const started = await connector.startAuth({ sameDevice });
    const pendingLinkId: Id<'pendingLinks'> = await ctx.runMutation(
      internal.links.createPendingLink,
      { store, orderRef: started.orderRef },
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
  args: {
    pendingLinkId: v.id('pendingLinks'),
  },
  returns: v.union(
    v.object({
      status: v.literal('pending'),
      qrCode: v.optional(v.string()),
      autoStartToken: v.optional(v.string()),
    }),
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
    if (!link)
      return { status: 'failed' as const, error: 'unknown pending link' };

    // The pending link records the store it was started for; poll the same one.
    const connector = getConnector(link.store, { fetch: defaultFetch });
    const result = await connector.pollAuth(link.orderRef);
    if (result.status === 'pending') {
      return {
        status: 'pending' as const,
        qrCode: result.qrCode,
        autoStartToken: result.autoStartToken,
      };
    }
    if (result.status === 'failed') {
      await ctx.runMutation(internal.links.failLink, { pendingLinkId });
      return { status: 'failed' as const, error: result.error };
    }
    // Encrypt here, in the action, so the mutation only ever sees ciphertext.
    const sealed = await encryptTokenPair(result.tokens);
    const connectionId: Id<'connections'> = await ctx.runMutation(
      internal.links.finishLink,
      {
        pendingLinkId,
        tokens: {
          accessToken: sealed.accessToken,
          refreshToken: sealed.refreshToken,
          expiresAt: result.tokens.expiresAt,
          refreshExpiresAt: result.tokens.refreshExpiresAt,
        },
      },
    );
    return { status: 'complete' as const, connectionId };
  },
});

// ── Internal DB effects ─────────────────────────────────────────────────────

export const createPendingLink = internalMutation({
  args: {
    store: storeValidator,
    orderRef: v.string(),
  },
  returns: v.id('pendingLinks'),
  handler: async (ctx, { store, orderRef }) => {
    const accountId = await getOrCreateAccountId(ctx);
    return await ctx.db.insert('pendingLinks', {
      accountId,
      store,
      orderRef,
      status: 'pending',
    });
  },
});

export const getPendingLink = internalQuery({
  args: {
    pendingLinkId: v.id('pendingLinks'),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('pendingLinks'),
      _creationTime: v.number(),
      accountId: v.id('accounts'),
      store: storeValidator,
      orderRef: v.string(),
      status: pendingLinkStatusValidator,
    }),
  ),
  handler: async (ctx, { pendingLinkId }) => {
    const link = await ctx.db.get(pendingLinkId);
    if (!link) return null;
    // Ownership: return null (not the row) for a foreign link so it can't be
    // distinguished from a missing one.
    const accountId = await readAccountId(ctx);
    if (accountId === null || link.accountId !== accountId) return null;
    return link;
  },
});

export const finishLink = internalMutation({
  args: {
    pendingLinkId: v.id('pendingLinks'),
    // Already encrypted by the caller (the `poll` action).
    tokens: v.object({
      accessToken: encryptedSecretValidator,
      refreshToken: encryptedSecretValidator,
      expiresAt: v.number(), // epoch ms
      refreshExpiresAt: v.optional(v.number()), // epoch ms
    }),
  },
  returns: v.id('connections'),
  handler: async (ctx, { pendingLinkId, tokens }) => {
    const link = await ctx.db.get(pendingLinkId);
    if (!link) throw new Error('pending link not found');

    // Upsert the (account, store) connection: refresh tokens if one exists,
    // otherwise create it. Kept in the mutation so it's transactional.
    const existing = await ctx.db
      .query('connections')
      .withIndex('by_account_store', (q) =>
        q.eq('accountId', link.accountId).eq('store', link.store),
      )
      .unique();

    const tokenFields = {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.expiresAt,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshExpiresAt,
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
  args: { pendingLinkId: v.id('pendingLinks') },
  returns: v.null(),
  handler: async (ctx, { pendingLinkId }) => {
    await ctx.db.patch(pendingLinkId, { status: 'failed' });
    return null;
  },
});
