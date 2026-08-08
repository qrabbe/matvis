import { createLocalStorageStore } from '@matvis/ui';

const visitorStore = createLocalStorageStore('matvis.catalog.visitor');

/** Lives as long as the tab, and is only reached when localStorage refuses. */
let fallbackId: string | null = null;

/** A random id the browser makes up so repeat searches can be told apart from
 * one person searching twice. It carries nothing about the person: no
 * fingerprint, no IP, no timestamp. Do not put anything else in it.
 *
 * Written once and never changed, so this is a plain function rather than the
 * store's `use()` hook. `use()` is `useSyncExternalStore` for values that
 * change, and using it here would re-render on the first search for nothing.
 *
 * `load` and `save` in the shared store call `window.localStorage` bare, which
 * throws in a hardened or private-mode browser, so both are wrapped. A browser
 * that cannot remember its id still gets its searches counted; it just looks
 * like a new visitor on every reload. */
export function visitorId(): string {
  try {
    const stored = visitorStore.load();
    if (stored) return stored;
    const created = crypto.randomUUID();
    visitorStore.save(created);
    return created;
  } catch {
    fallbackId ??= crypto.randomUUID();
    return fallbackId;
  }
}
