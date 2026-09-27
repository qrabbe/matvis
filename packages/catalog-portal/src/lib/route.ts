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
  | { kind: 'front'; store: CatalogStore }
  | { kind: 'category'; store: CatalogStore; slugPath: string }
  | { kind: 'branch'; store: CatalogStore; slugPath: string };

/** A category node's own screen, e.g. `mejeri-agg` or `mejeri-agg/mjolk`.
 * `slugPath` is slash-joined, matching `categoryTree.slug` exactly. */
export function categoryPath(store: CatalogStore, slugPath: string): string {
  return `/c/${store}/${slugPath}`;
}

/** Every product in a branch, whether or not it has children. */
export function branchPath(store: CatalogStore, slugPath: string): string {
  return `${categoryPath(store, slugPath)}/all`;
}

/** What the Catalog tab shows: `#/` and an unrecognised path both fall back to
 * Coop's front page. */
export function catalogRoute(path: string): CatalogRoute {
  const [rawPathname = '/', queryString = ''] = path.split('?');
  const pathname = rawPathname === '/' ? '/' : rawPathname.replace(/\/$/, '');
  const query = new URLSearchParams(queryString);

  const searchMatch = /^\/s\/([a-z]+)$/.exec(pathname);
  const searchStore = searchMatch?.[1];
  if (searchStore && isCatalogStore(searchStore)) {
    return { kind: 'search', store: searchStore, term: query.get('q') ?? '' };
  }

  const frontMatch = /^\/c\/([a-z]+)$/.exec(pathname);
  const frontStore = frontMatch?.[1];
  if (frontStore && isCatalogStore(frontStore)) {
    return { kind: 'front', store: frontStore };
  }

  const branchMatch = /^\/c\/([a-z]+)\/(.+)\/all$/.exec(pathname);
  if (branchMatch) {
    const [, branchStore, slugPath] = branchMatch;
    if (branchStore && isCatalogStore(branchStore) && slugPath) {
      return { kind: 'branch', store: branchStore, slugPath };
    }
  }

  const categoryMatch = /^\/c\/([a-z]+)\/(.+)$/.exec(pathname);
  if (categoryMatch) {
    const [, categoryStore, slugPath] = categoryMatch;
    if (categoryStore && isCatalogStore(categoryStore) && slugPath) {
      return { kind: 'category', store: categoryStore, slugPath };
    }
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
