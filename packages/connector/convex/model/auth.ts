import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import {
  findAccount,
  findAccountByToken,
  getOrCreateAccount,
} from './accounts';

async function callerSubject(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error('Unauthenticated');
  return userId;
}

export async function readAccountId(
  ctx: QueryCtx,
): Promise<Id<'accounts'> | null> {
  return findAccount(ctx, await callerSubject(ctx));
}

/** The token path's whole authority. It never consults the login session, so an
 * empty or absent token must never match a row. */
export async function readScopedAccountId(
  ctx: QueryCtx,
  token?: string,
): Promise<Id<'accounts'> | null> {
  return token !== undefined
    ? findAccountByToken(ctx, token)
    : readAccountId(ctx);
}

export async function getOrCreateAccountId(
  ctx: MutationCtx,
): Promise<Id<'accounts'>> {
  return getOrCreateAccount(ctx, await callerSubject(ctx));
}
