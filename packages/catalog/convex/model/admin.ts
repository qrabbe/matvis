/**
 * Session primitives for the admin console's one-password gate.
 *
 * Kept out of `admin.ts` so the pieces that are pure computation (hashing,
 * token generation, the constant-time compare) can be read and tested without
 * loading a module that registers Convex functions.
 */

/** How long a sign-in lasts before the console has to ask for the password
 * again. Short enough that a stolen token expires on its own, long enough to
 * watch a full discovery run without re-authenticating. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Failed sign-ins allowed inside one window before the door locks. */
export const SIGNIN_FAILURE_LIMIT = 10;

/** Length of the failure window, and of the lockout a full window earns. */
export const SIGNIN_WINDOW_MS = 60 * 60 * 1000;

/** Wall clock every rejected sign-in costs, so guessing cannot be run at
 * request speed. Applied to a locked door too, so "locked" and "wrong" take the
 * same time to answer. */
export const SIGNIN_FAILURE_DELAY_MS = 1000;

/** Expired session rows swept per successful sign-in. Bounded because the sweep
 * rides along on a request a human is waiting for. */
export const SESSION_SWEEP_LIMIT = 50;

/** Session rows one "sign out everywhere" deletes. A guard against an unbounded
 * scan, not a page: with one password and a sweep on every sign-in this table
 * holds single digits of rows. */
export const SESSION_REVOKE_LIMIT = 500;

/** Bytes of randomness behind a session token. 32 bytes is what the token's
 * SHA-256 can hold, so nothing is gained by going wider. */
const TOKEN_BYTES = 32;

/** Hex for a byte buffer, lower case and zero padded. */
function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A fresh session token. Only ever returned to the caller that signed in, never
 * stored. Call this from an ACTION: `crypto.getRandomValues` is seeded rather
 * than random inside a query or a mutation, which would make tokens guessable.
 */
export function generateSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256 of `text` as lower case hex. What `admin_sessions` stores, so a
 * database leak hands over hashes rather than live credentials. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * Whether two secrets are equal, in time that does not depend on how far they
 * agree. Compares their SHA-256 digests rather than the secrets themselves, so
 * the compare runs over a fixed 64 characters and the loop cannot leak the
 * password's length either.
 */
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

/** Wait `ms`, for the deliberate delay on a rejected sign-in. Actions only. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
