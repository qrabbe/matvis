import { createLocalStorageStore } from '@matvis/ui';

// Stores the token the sign-in action returned, never the password.
const tokenStore = createLocalStorageStore('matvis.catalog.adminToken');

export function storeAdminToken(token: string): void {
  tokenStore.save(token);
}

export function clearAdminToken(): void {
  tokenStore.clear();
}

export function useAdminToken(): string | null {
  return tokenStore.use();
}
