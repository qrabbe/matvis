import { useSyncExternalStore } from 'react';

export type LocalStorageStore = {
  load: () => string | null;
  save: (value: string) => void;
  clear: () => void;
  use: () => string | null;
};

/**
 * One string in `localStorage`, readable as a hook that re-renders on every
 * change to it — including one made in another tab, which is the part every
 * hand-rolled copy of this either repeated or quietly went without.
 */
export function createLocalStorageStore(key: string): LocalStorageStore {
  // Notifies subscribers in THIS tab; the `storage` event covers the others.
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    window.addEventListener('storage', onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onChange);
    };
  }

  function load(): string | null {
    return window.localStorage.getItem(key);
  }

  return {
    load,
    save(value: string): void {
      window.localStorage.setItem(key, value);
      emit();
    },
    clear(): void {
      window.localStorage.removeItem(key);
      emit();
    },
    // Server-rendered and pre-hydration reads have no storage, hence the null
    // snapshot.
    use: () => useSyncExternalStore(subscribe, load, () => null),
  };
}
