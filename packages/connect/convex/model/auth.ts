import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import { findAccount, getOrCreateAccount } from './accounts';

// The auth seam: every entry point resolves the caller's account here. Identity
// wins; the dev-supplied `subject` is a fallback behind ALLOW_DEV_SUBJECT. When
// a real provider is wired in convex/auth.config.ts, drop the fallback. The
// identity branch below is the one place that changes.

// DEV ONLY: set ALLOW_DEV_SUBJECT=true on the dev deployment so the portal's
// client-supplied subject works before real auth exists. Production leaves it
// unset, so an unauthenticated caller throws.
const ALLOW_DEV_SUBJECT = process.env.ALLOW_DEV_SUBJECT === 'true';

/** Resolve the caller's connector subject: real auth first, dev fallback second. */
async function callerSubject(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  devSubject?: string,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.tokenIdentifier; // canonical stable id
  if (ALLOW_DEV_SUBJECT && devSubject) return devSubject;
  throw new Error('Unauthenticated: no identity and dev subject not allowed');
}

/** Read-only: caller's accountId, or null if the account doesn't exist yet. */
export async function requireAccountRead(
  ctx: QueryCtx,
  devSubject?: string,
): Promise<Id<'accounts'> | null> {
  return findAccount(ctx, await callerSubject(ctx, devSubject));
}

/** Read-write: caller's accountId, creating it on first use. */
export async function requireAccount(
  ctx: MutationCtx,
  devSubject?: string,
): Promise<Id<'accounts'>> {
  return getOrCreateAccount(ctx, await callerSubject(ctx, devSubject));
}
