import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getOrCreateAccountId, readAccountId } from './model/auth';
import { ensureAccountToken, readAccountToken } from './model/accounts';

// The account-wide API read token: the single credential a third-party service
// holds. Paired with the deployment's public URL and the `convex` client SDK,
// it's everything needed to read this account's receipts, with no login and no
// secret from us. Both handlers are session-scoped: only the logged-in owner can
// see or mint their own token. The token then scopes reads on its own (see
// `receipts.ts` and `model/auth.readScopedAccountId`).

/** The caller's API token, or `null` if none has been minted yet (or the caller
 * has no account). Reactive and read-only. The UI shows the token once it exists. */
export const get = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const accountId = await readAccountId(ctx);
    if (accountId === null) return null;
    return readAccountToken(ctx, accountId);
  },
});

/** Mint (or return) the caller's API token. Idempotent: the same account always
 * gets the same token back, so it's safe to call repeatedly. Creates the
 * connector account on first use. */
export const create = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const accountId = await getOrCreateAccountId(ctx);
    return ensureAccountToken(ctx, accountId);
  },
});
