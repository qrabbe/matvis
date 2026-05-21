import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/** Resolve the connector account for `subject`, creating it on first use. */
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

/** Read-only account lookup for `subject`; `null` if none exists yet. */
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
