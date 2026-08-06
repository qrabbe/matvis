import { useSyncExternalStore } from 'react';

export function productPath(ean: string): string {
  return `/p/${encodeURIComponent(ean)}`;
}

export const ADMIN_PATH = '/admin';

export function isAdminPath(path: string): boolean {
  return path.replace(/\/$/, '') === ADMIN_PATH;
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
  const match = /^\/p\/([^/]+)\/?$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
