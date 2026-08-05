import { useSyncExternalStore } from 'react';

export type LocalStorageStore = {
  load: () => string | null;
  save: (value: string) => void;
  clear: () => void;
  use: () => string | null;
};

export function createLocalStorageStore(key: string): LocalStorageStore {
  // The `storage` event only fires in other tabs, so this tab needs its own.
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
    use: () => useSyncExternalStore(subscribe, load, () => null),
  };
}
