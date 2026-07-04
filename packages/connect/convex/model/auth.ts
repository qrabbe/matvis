import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import {
  findAccount,
  findAccountByToken,
  getOrCreateAccount,
} from './accounts';

// The auth seam: every entry point resolves the caller's account here from the
// authenticated identity. This is the one place that changes if auth changes.

/** The caller's stable identity, or throw if unauthenticated. Returns the auth
 * `users` id — stable across logout/login for the same login. (The raw
 * `identity.tokenIdentifier`/`subject` embeds the per-login session id, so
 * keying on it would mint a fresh account, and a fresh API token, every login.) */
async function callerSubject(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error('Unauthenticated');
  return userId;
}

/** Caller's accountId, or `null` if the account doesn't exist yet (read-only). */
export async function readAccountId(
  ctx: QueryCtx,
): Promise<Id<'accounts'> | null> {
  return findAccount(ctx, await callerSubject(ctx));
}

/** Resolve the account a read is scoped to. With an explicit API `token` the
 * read is scoped by that token alone, with no login session consulted, exactly
 * how a decoupled third-party service reads. Without one it falls back to the
 * caller's login session (the portal's own reads). Returns `null` when neither
 * resolves an account. This is the one seam the two read paths share. */
export async function readScopedAccountId(
  ctx: QueryCtx,
  token?: string,
): Promise<Id<'accounts'> | null> {
  return token !== undefined
    ? findAccountByToken(ctx, token)
    : readAccountId(ctx);
}

/** Caller's accountId, creating it on first use (read-write). */
export async function getOrCreateAccountId(
  ctx: MutationCtx,
): Promise<Id<'accounts'>> {
  return getOrCreateAccount(ctx, await callerSubject(ctx));
}
