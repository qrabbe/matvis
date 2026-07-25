import { useSyncExternalStore } from 'react';

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

const TOKEN_KEY = 'matvis.catalog.adminToken';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Store the token from a successful sign-in. */
export function storeAdminToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  emit();
}

/** Forget the token in THIS browser. Sessions the backend still holds are
 * untouched, which is what "sign out everywhere" is for. */
export function clearAdminToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  emit();
}

function readToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // `storage` fires in OTHER tabs, so signing out in one tab signs out the rest.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The stored admin token, or null. Re-renders when it is set or cleared,
 * including from another tab. */
export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribe, readToken, () => null);
}
