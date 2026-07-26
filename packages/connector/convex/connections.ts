import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { readScopedAccountId } from './model/auth';
import { connectionPublicValidator } from './validators';

/** Connections one account can have listed. One row per (account, store), so
 * this is far above the number of chains that exist. */
const MAX_CONNECTIONS_PER_ACCOUNT = 20;

// Public read API for an account's store connections, scoped exactly like the
// receipts read API: an explicit API `token` (the decoupled third-party path, no
// login) or, without one, the caller's login session. Secrets (the access and
// refresh tokens) are NEVER returned, only the store, status, and expiry
// timestamps a reader needs to tell whether a link is still valid.

/** Drop a connection's secrets, keeping only what a reader may see. */
function toPublic(c: Doc<'connections'>) {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    store: c.store,
    status: c.status,
    accessTokenExpiresAt: c.accessTokenExpiresAt,
    refreshTokenExpiresAt: c.refreshTokenExpiresAt,
    lastSyncedAt: c.lastSyncedAt,
  };
}

/**
 * Every store connection under one account, newest first. Empty when the
 * token/session resolves to no account.
 *
 * Bounded well above the number of chains that exist: there is one row per
 * (account, store), so this can only be reached by duplicate rows, and a
 * ceiling keeps a live subscription's cost fixed if that ever happens.
 */
export const list = query({
  args: { token: v.optional(v.string()) },
  returns: v.array(connectionPublicValidator),
  handler: async (ctx, { token }) => {
    const accountId = await readScopedAccountId(ctx, token);
    if (accountId === null) return [];
    const rows = await ctx.db
      .query('connections')
      .withIndex('by_account', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(MAX_CONNECTIONS_PER_ACCOUNT);
    return rows.map(toPublic);
  },
});
