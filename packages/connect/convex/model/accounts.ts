import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Resolve the connector account for `subject`, creating it on first use.
 *
 * Centralized so that when real service auth lands, only the *callers* need to
 * switch from a client-supplied subject to `ctx.auth.getUserIdentity()` — this
 * lookup stays the same.
 */
export async function getOrCreateAccount(
  ctx: MutationCtx,
  subject: string,
): Promise<Id<'accounts'>> {
  const existing = await ctx.db
    .query('accounts')
    .withIndex('by_subject', (q) => q.eq('subject', subject))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert('accounts', { subject });
}

/**
 * Read-only lookup of the account for `subject`; `null` if none exists yet.
 *
 * The query counterpart of {@link getOrCreateAccount} — a query can't insert,
 * so callers scope to the returned id or short-circuit to an empty result. Same
 * `by_subject` index; keep this the single account-resolution point for reads
 * so real service auth can swap it for `requireAccount(ctx)` in one place.
 */
export async function findAccount(
  ctx: QueryCtx,
  subject: string,
): Promise<Id<'accounts'> | null> {
  const existing = await ctx.db
    .query('accounts')
    .withIndex('by_subject', (q) => q.eq('subject', subject))
    .first();
  return existing?._id ?? null;
}
