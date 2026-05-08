import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

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
