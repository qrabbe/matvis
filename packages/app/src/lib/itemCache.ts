import type { ReceiptItemDoc } from '@matvis/shared';

const DB_NAME = 'matvis.app';
const STORE = 'receiptItems';

// v2: entries now carry `cachedAt` and expire. v1 had none, so a receipt
// fetched once before this line ever ran (or before a later relink) stayed
// stuck showing its gtin as unmatched forever — the cache had no way to
// learn that `matching:matchReceipt` had patched it server-side since. The
// version bump alone clears every v1 entry on next load; the TTL keeps that
// from happening again.
const CACHE_VERSION = 2;

const storeName = `${STORE}.v${CACHE_VERSION}`;

/** How long a cached receipt's items are trusted before this refetches them
 * regardless. Short enough that matching new lines in (this or another) linker
 * session shows up on the next reasonable visit, long enough that a normal
 * session still avoids re-fetching every receipt's items on every render. */
const CACHE_TTL_MS = 60 * 60 * 1000;

type CachedEntry = { items: ReceiptItemDoc[]; cachedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, CACHE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of Array.from(db.objectStoreNames)) {
        if (name !== storeName) db.deleteObjectStore(name);
      }
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export async function cacheScope(token: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return fnv1a(token);
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return fnv1a(token);
  }
}

function scopedKey(scope: string, receiptId: string): string {
  return `${scope}:${receiptId}`;
}

function scopeRange(scope: string): IDBKeyRange {
  return IDBKeyRange.bound(
    `${scope}:`,
    `${scope}:${String.fromCharCode(0xffff)}`,
  );
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCachedItems(
  scope: string,
): Promise<Map<string, ReceiptItemDoc[]>> {
  const db = await openDb();
  const out = new Map<string, ReceiptItemDoc[]>();
  if (!db || !db.objectStoreNames.contains(storeName)) return out;
  try {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const range = scopeRange(scope);
    const [keys, values] = await Promise.all([
      promisify(store.getAllKeys(range)),
      promisify(store.getAll(range) as IDBRequest<CachedEntry[]>),
    ]);
    const now = Date.now();
    keys.forEach((key, i) => {
      const entry = values[i];
      if (typeof key !== 'string' || !entry) return;
      // Expired entries are simply left out, not returned as stale data —
      // the caller (usePurchaseData) treats "not in this map" as "go fetch
      // it", the same as a receipt it has never seen.
      if (now - entry.cachedAt > CACHE_TTL_MS) return;
      out.set(key.slice(scope.length + 1), entry.items);
    });
  } catch {}
  return out;
}

export async function putCachedItems(
  scope: string,
  receiptId: string,
  items: ReceiptItemDoc[],
): Promise<void> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return;
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const entry: CachedEntry = { items, cachedAt: Date.now() };
    tx.objectStore(storeName).put(entry, scopedKey(scope, receiptId));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
}

/** Paired with "Forget token": the cache holds an account's purchase history,
 * so it must not outlive that account's credential. */
export async function clearCachedItems(): Promise<void> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return;
  try {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
}

export async function clearOtherScopes(scope: string): Promise<void> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return;
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const keys = await promisify(store.getAllKeys());
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(`${scope}:`)) continue;
      store.delete(key);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
}
