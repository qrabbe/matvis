import { createLocalStorageStore } from '@matvis/ui';

// ── Last-connection persistence ─────────────────────────────────────────────
// The dev-subject shim is gone: the caller's account is resolved server-side
// from the authenticated identity (Convex Auth). This file now only remembers
// the most recent completed store link so a returning session can resume it.

const connectionStore = createLocalStorageStore(
  'matvis.connector.connectionId',
);

/** The last connectionId produced by a completed link, if any. */
export function loadConnectionId(): string | null {
  return connectionStore.load();
}

export function saveConnectionId(id: string): void {
  connectionStore.save(id);
}

export function clearConnectionId(): void {
  connectionStore.clear();
}
