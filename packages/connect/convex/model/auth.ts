import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import { findAccount, getOrCreateAccount } from './accounts';

// The auth seam: every entry point resolves the caller's account here from the
// authenticated identity. This is the one place that changes if auth changes.

/** The caller's stable identity, or throw if unauthenticated. */
async function callerSubject(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Unauthenticated');
  return identity.tokenIdentifier; // canonical stable id
}

/** Caller's accountId, or `null` if the account doesn't exist yet (read-only). */
export async function readAccountId(
  ctx: QueryCtx,
): Promise<Id<'accounts'> | null> {
  return findAccount(ctx, await callerSubject(ctx));
}

/** Caller's accountId, creating it on first use (read-write). */
export async function getOrCreateAccountId(
  ctx: MutationCtx,
): Promise<Id<'accounts'>> {
  return getOrCreateAccount(ctx, await callerSubject(ctx));
}
