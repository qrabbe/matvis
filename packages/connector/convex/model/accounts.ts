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

/** Resolve an account from its API access token, or `null` if none matches.
 * This is the token path's whole authority. It never consults the login
 * session, so a third-party service holding only the token (plus the public
 * deployment URL) reads through here. An empty string never matches, guarding
 * against a blank paste. */
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

/** The current API token for `accountId`, or `null` if none minted yet. */
export async function readAccountToken(
  ctx: QueryCtx,
  accountId: Id<'accounts'>,
): Promise<string | null> {
  const acct = await ctx.db.get(accountId);
  return acct?.token ?? null;
}

/** Ensure `accountId` has an API token, minting one on first call. Idempotent:
 * once set, the same token is returned forever. */
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

/** A fresh opaque access token: `mvk_` + 48 hex chars (24 random bytes). */
function generateAccessToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `mvk_${hex}`;
}
