import { useCallback } from 'react';
import { createLocalStorageStore } from '@matvis/ui';

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
const tokenStore = createLocalStorageStore('matvis.app.apiToken');

/**
 * An earlier build stored live Coop access and refresh tokens here. Nothing
 * reads that key any more, so drop it wherever we find it.
 */
const LEGACY_COOP_TOKENS_KEY = 'matvis.coop.tokens';

function dropLegacyCoopTokens(): void {
  localStorage.removeItem(LEGACY_COOP_TOKENS_KEY);
}

dropLegacyCoopTokens();

/** A blank stored token reads the same as no token at all. */
function nonEmpty(raw: string | null): string | null {
  return raw && raw.trim() ? raw : null;
}

export function loadApiToken(): string | null {
  return nonEmpty(tokenStore.load());
}

export function saveApiToken(token: string): void {
  tokenStore.save(token.trim());
}

export function clearApiToken(): void {
  tokenStore.clear();
  dropLegacyCoopTokens();
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
  const token = nonEmpty(tokenStore.use());
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
