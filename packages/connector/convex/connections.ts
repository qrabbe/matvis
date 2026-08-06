import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { readScopedAccountId } from './model/auth';
import { connectionPublicValidator } from './validators';

const MAX_CONNECTIONS_PER_ACCOUNT = 20;

/** The access and refresh tokens are never returned, only store, status and
 * expiry. */
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
