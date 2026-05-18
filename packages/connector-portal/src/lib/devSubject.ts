import { useState } from 'react';

// ── The dev-identity shim ───────────────────────────────────────────────────
// Auth is scaffolded server-side (approach A) but no login provider is wired
// yet, so every connector entry point accepts an optional `subject`. The portal
// mints a stable dev subject once and passes it on every call. This whole file
// is the single thing that goes away when real auth lands: swap `useDevSubject`
// for the authenticated user id and drop the `subject` args.

const SUBJECT_KEY = 'matvis.connector.subject';
const CONNECTION_KEY = 'matvis.connector.connectionId';

/** Read (or lazily create) the stable per-browser dev subject. */
export function useDevSubject(): string {
  const [subject] = useState<string>(() => {
    const existing = localStorage.getItem(SUBJECT_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(SUBJECT_KEY, fresh);
    return fresh;
  });
  return subject;
}

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
