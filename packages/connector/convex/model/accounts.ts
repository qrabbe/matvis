import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

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

export async function findAccountByToken(
  ctx: QueryCtx,
  token: string,
): Promise<Id<'accounts'> | null> {
  if (token === '') return null;
  const hit = await ctx.db
    .query('accounts')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique();
  return hit?._id ?? null;
}

export async function readAccountToken(
  ctx: QueryCtx,
  accountId: Id<'accounts'>,
): Promise<string | null> {
  const acct = await ctx.db.get(accountId);
  return acct?.token ?? null;
}

export async function ensureAccountToken(
  ctx: MutationCtx,
  accountId: Id<'accounts'>,
): Promise<string> {
  const acct = await ctx.db.get(accountId);
  if (acct === null) throw new Error('Account not found');
  if (acct.token) return acct.token;
  const token = generateAccessToken();
  await ctx.db.patch(accountId, { token });
  return token;
}

function generateAccessToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `mvk_${hex}`;
}
