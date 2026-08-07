import type { MutationCtx, QueryCtx } from '../_generated/server';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const SIGNIN_FAILURE_LIMIT = 10;

export const SIGNIN_WINDOW_MS = 60 * 60 * 1000;

export const SIGNIN_FAILURE_DELAY_MS = 1000;

export const SESSION_SWEEP_LIMIT = 25;

export const SESSION_REVOKE_LIMIT = 500;

const TOKEN_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Actions only: `crypto.getRandomValues` is seeded inside a query or mutation,
 * which would make tokens guessable. */
export function generateSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return toHex(new Uint8Array(digest));
}

/** Compares digests, not the secrets, so the loop leaks neither how far they
 * agree nor the password's length. Never simplify to `===`. */
export async function secretsMatch(
  candidate: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Takes the hash rather than the token because an action cannot reach the
 * database and has to hash on its own side before asking. */
export async function sessionLiveByHash(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
): Promise<boolean> {
  const row = await ctx.db
    .query('admin_sessions')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .first();
  return row !== null && row.expiresAt > Date.now();
}
