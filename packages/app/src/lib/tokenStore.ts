import { useCallback } from 'react';
import { createLocalStorageStore } from '@matvis/ui';

// A bearer credential in `localStorage` that survives a tab close, so the app
// must always offer a visible way to drop it.
const tokenStore = createLocalStorageStore('matvis.app.apiToken');

const LEGACY_COOP_TOKENS_KEY = 'matvis.coop.tokens';

function dropLegacyCoopTokens(): void {
  localStorage.removeItem(LEGACY_COOP_TOKENS_KEY);
}

dropLegacyCoopTokens();

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

export function looksLikeToken(value: string): boolean {
  return value.trim().length > 0;
}
