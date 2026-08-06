import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getOrCreateAccountId, readAccountId } from './model/auth';
import { ensureAccountToken, readAccountToken } from './model/accounts';

export const get = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const accountId = await readAccountId(ctx);
    if (accountId === null) return null;
    return readAccountToken(ctx, accountId);
  },
});

export const create = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const accountId = await getOrCreateAccountId(ctx);
    return ensureAccountToken(ctx, accountId);
  },
});
