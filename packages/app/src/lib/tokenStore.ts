import { useCallback, useSyncExternalStore } from 'react';

/**
 * Local-only persistence for the connector's account API token — the single
 * credential the app holds.
 *
 * It is minted in the connector portal (`accessToken.create`, session-gated) and
 * pasted in here. It grants READ access to one account's receipts and nothing
 * else: every connector write resolves the caller through a login session, which
 * a bare token is not.
 *
 * It is a bearer credential in `localStorage` and it survives a tab close, so
 * the app must always offer a visible way to drop it. See the Preferences tab's
 * "Forget token" control.
 */
const STORAGE_KEY = 'matvis.app.apiToken';

/**
 * An earlier build stored live Coop access and refresh tokens here. Nothing
 * reads that key any more, so drop it wherever we find it.
 */
const LEGACY_COOP_TOKENS_KEY = 'matvis.coop.tokens';

function dropLegacyCoopTokens(): void {
  localStorage.removeItem(LEGACY_COOP_TOKENS_KEY);
}

dropLegacyCoopTokens();

/** Notifies `useApiToken` subscribers in THIS tab; `storage` covers other tabs. */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function loadApiToken(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && raw.trim() ? raw : null;
}

export function saveApiToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token.trim());
  emit();
}

export function clearApiToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  dropLegacyCoopTokens();
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // A second tab writing the same key fires `storage` here but not our own emit.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The stored API token, re-rendering on every change including one made in
 * another tab. The returned setters are stable, so this can sit in a dependency
 * array without churn.
 */
export function useApiToken(): {
  token: string | null;
  setToken: (token: string) => void;
  forgetToken: () => void;
} {
  const token = useSyncExternalStore(subscribe, loadApiToken, () => null);
  const setToken = useCallback((next: string) => saveApiToken(next), []);
  const forgetToken = useCallback(() => clearApiToken(), []);
  return { token, setToken, forgetToken };
}

/**
 * A token is opaque to us: the connector mints it and only the connector can
 * judge it. So "valid" here means only "non-empty". A wrong token arrives as an
 * account with no receipts, which the token gate explains rather than
 * pretending to have caught up front.
 */
export function looksLikeToken(value: string): boolean {
  return value.trim().length > 0;
}
