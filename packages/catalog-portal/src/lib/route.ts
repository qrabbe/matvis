import { useSyncExternalStore } from 'react';

export type CatalogStore = 'coop' | 'ica';

function isCatalogStore(value: string): value is CatalogStore {
  return value === 'coop' || value === 'ica';
}

export function productPath(ean: string, store?: CatalogStore): string {
  const query = store ? `?store=${store}` : '';
  return `/p/${encodeURIComponent(ean)}${query}`;
}

/** Coop's is `/`, always; ICA's is the only other chain the portal knows. */
export function storeFrontPath(store: CatalogStore): string {
  return store === 'coop' ? '/' : `/c/${store}`;
}

export function searchPath(store: CatalogStore, term: string): string {
  const query = term ? `?q=${encodeURIComponent(term)}` : '';
  return `/s/${store}${query}`;
}

export type CatalogRoute =
  | { kind: 'search'; store: CatalogStore; term: string }
  | { kind: 'front'; store: CatalogStore };

/** What the Catalog tab shows: `#/` and an unrecognised path both fall back to
 * Coop's front page. */
export function catalogRoute(path: string): CatalogRoute {
  const [pathname = '/', queryString = ''] = path.split('?');
  const query = new URLSearchParams(queryString);

  const searchMatch = /^\/s\/([a-z]+)\/?$/.exec(pathname);
  const searchStore = searchMatch?.[1];
  if (searchStore && isCatalogStore(searchStore)) {
    return { kind: 'search', store: searchStore, term: query.get('q') ?? '' };
  }

  const frontMatch = /^\/c\/([a-z]+)\/?$/.exec(pathname);
  const frontStore = frontMatch?.[1];
  if (frontStore && isCatalogStore(frontStore)) {
    return { kind: 'front', store: frontStore };
  }

  return { kind: 'front', store: 'coop' };
}

export const ADMIN_PATH = '/admin';

export function isAdminPath(path: string): boolean {
  return path.replace(/\/$/, '') === ADMIN_PATH;
}

export const DEVELOPERS_PATH = '/developers';

export function isDevelopersPath(path: string): boolean {
  return path.replace(/\/$/, '') === DEVELOPERS_PATH;
}

export function href(path: string): string {
  return `#${path}`;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function eanFromPath(path: string): string | null {
  const [pathname = ''] = path.split('?');
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
