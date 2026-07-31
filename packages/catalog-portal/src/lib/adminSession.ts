import { createLocalStorageStore } from '@matvis/ui';

// ── Admin session token, in localStorage ─────────────────────────────────────
// The console stores the token the sign-in action returned, never the password.
// A bearer token in localStorage is stealable by any XSS in this bundle, which
// is the tradeoff this console accepts knowingly: the portal renders no
// user-supplied HTML, and the mitigations are the token's 12 hour expiry plus
// "sign out everywhere". Nothing here pretends otherwise.
//
// localStorage rather than sessionStorage so a reload or a second tab does not
// ask for the password again, which is the difference between a console someone
// leaves open while a drain runs and one they close.

const tokenStore = createLocalStorageStore('matvis.catalog.adminToken');

/** Store the token from a successful sign-in. */
export function storeAdminToken(token: string): void {
  tokenStore.save(token);
}

/** Forget the token in THIS browser. Sessions the backend still holds are
 * untouched, which is what "sign out everywhere" is for. */
export function clearAdminToken(): void {
  tokenStore.clear();
}

/** The stored admin token, or null. Re-renders when it is set or cleared,
 * including from another tab, so signing out in one tab signs out the rest. */
export function useAdminToken(): string | null {
  return tokenStore.use();
}
