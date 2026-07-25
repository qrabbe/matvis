import { useSyncExternalStore } from 'react';

// ── Hash routing ─────────────────────────────────────────────────────────────
// The portal is a static bundle served from a sub-path of one shared site (see
// tools/build-site.ts), with no server able to rewrite unknown paths back to
// index.html. A real path route like /catalog/p/<ean> would therefore 404 on a
// cold load or a shared link — exactly the case a deep link exists for. The hash
// never reaches the server, so `…/catalog/#/p/<ean>` works on any host with no
// build or hosting config, which is worth more here than a prettier URL. Small
// enough to not want a router dependency for.

/** The route path a product detail page lives at. */
export function productPath(ean: string): string {
  return `/p/${encodeURIComponent(ean)}`;
}

/** The admin console's route. Deliberately not in the tab bar: the public portal
 * is a product page, and the console is not part of it. There is no secret in
 * knowing the path, because the gate is entirely server side. */
export const ADMIN_PATH = '/admin';

/** Whether a path addresses the admin console. */
export function isAdminPath(path: string): boolean {
  return path.replace(/\/$/, '') === ADMIN_PATH;
}

/** An `href` for a route path, for real anchors (middle-click, copy link). */
export function href(path: string): string {
  return `#${path}`;
}

/** Go to a route path, adding a history entry. */
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

/** The current route path, e.g. `/` or `/p/7311312009203`. Re-renders on
 * navigation, including the browser's back and forward buttons. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

/** The EAN a path addresses, or null when it is not a product route. */
export function eanFromPath(path: string): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
