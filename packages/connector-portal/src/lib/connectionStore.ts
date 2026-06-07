// ── Last-connection persistence ─────────────────────────────────────────────
// The dev-subject shim is gone: the caller's account is resolved server-side
// from the authenticated identity (Convex Auth). This file now only remembers
// the most recent completed store link so a returning session can resume it.

const CONNECTION_KEY = 'matvis.connector.connectionId';

/** The last connectionId produced by a completed link, if any. */
export function loadConnectionId(): string | null {
  return localStorage.getItem(CONNECTION_KEY);
}

export function saveConnectionId(id: string): void {
  localStorage.setItem(CONNECTION_KEY, id);
}

export function clearConnectionId(): void {
  localStorage.removeItem(CONNECTION_KEY);
}
