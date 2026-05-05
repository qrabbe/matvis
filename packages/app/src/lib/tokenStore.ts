import { TokenSet } from '@matvis/shared';

/**
 * Local-only persistence for the BankID token set
 */
const STORAGE_KEY = 'matvis.coop.tokens';

export function loadTokens(): TokenSet | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = TokenSet.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}
