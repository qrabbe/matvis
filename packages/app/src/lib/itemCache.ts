import type { ReceiptItemDoc } from '@matvis/shared';

/**
 * IndexedDB cache of receipt LINE ITEMS, keyed by account scope and receipt
 * `_id`.
 *
 * The scope is a hash of the API token, not the token itself: an object store
 * is readable by anything running on the origin, and a credential has no
 * business sitting in one. It exists because the store outlives the token in
 * the tab — without it a second account reads the first account's receipts back
 * out of disk moments after the in-memory reset cleared them.
 *
 * The connector exposes paginated headers and one receipt's items, with no
 * cross-receipt item query (`receiptItems` only has a `by_receipt` index). So
 * Pantry, Nutrition and Unmapped, which all need every line for the account, are
 * a client-side fan-out of N `getReceipt` calls.
 *
 * That is only tolerable because a synced receipt never changes: it is written
 * once by the sync and never touched again. So the cache needs no TTL and no
 * invalidation strategy beyond {@link CACHE_VERSION} — immutable data cannot go
 * stale. First load pays N round trips behind a progress bar; every load after
 * that reads from disk.
 *
 * localStorage is the wrong store here (a 5 MB string quota, synchronous, and
 * the whole point is thousands of item rows), which is why this is IndexedDB
 * despite being more code.
 */

const DB_NAME = 'matvis.app';
const STORE = 'receiptItems';

/**
 * Bumped BY HAND when the cached item shape changes — that is, when
 * {@link ReceiptItemDoc} gains or loses a field the app reads. There is no
 * automatic detection: a stale row would simply be missing the new field, which
 * reads as `undefined` rather than as an error. Bumping opens a fresh object
 * store and abandons the old one.
 */
const CACHE_VERSION = 1;

/** The versioned store name, so a bump is a clean break rather than a migration. */
const storeName = `${STORE}.v${CACHE_VERSION}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Open (and upgrade) the database once per session. Resolves `null` when
 * IndexedDB is unavailable — private-mode Safari, some embedded webviews — in
 * which case every call below degrades to a no-op and the app just re-fetches. */
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
      // Drop every earlier version's store: the data is a cache of immutable
      // server rows, so re-fetching is always correct and always cheap enough.
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

/** Non-cryptographic fallback for contexts without `crypto.subtle`, which is
 * every page not served over https or localhost. Still one-way, which is all
 * this needs. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The cache scope for one account: a truncated digest of its API token, never
 * the token. Truncation is fine here — the scope only has to separate accounts
 * on one device, not resist a search of the space. */
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

/** The key one receipt is stored under. Scope first, so one account's rows are
 * a contiguous key range and reading them is one bounded cursor. */
function scopedKey(scope: string, receiptId: string): string {
  return `${scope}:${receiptId}`;
}

/** Every key belonging to one scope. The upper bound is the highest code unit,
 * so it covers any receipt id without knowing one. */
function scopeRange(scope: string): IDBKeyRange {
  return IDBKeyRange.bound(
    `${scope}:`,
    `${scope}:${String.fromCharCode(0xffff)}`,
  );
}

/** Promisify one IndexedDB request. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * One account's cached receipts, as a map from receipt `_id`. Read in one
 * transaction at startup rather than per receipt: the caller immediately needs
 * to know which ids are MISSING, and N point reads to answer that would undo the
 * saving.
 */
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
      promisify(store.getAll(range) as IDBRequest<ReceiptItemDoc[][]>),
    ]);
    keys.forEach((key, i) => {
      const items = values[i];
      if (typeof key !== 'string' || !items) return;
      out.set(key.slice(scope.length + 1), items);
    });
  } catch {
    // A corrupt or blocked store is not worth failing the app over: an empty
    // map means "nothing cached", and the caller re-fetches.
  }
  return out;
}

/** Cache one receipt's items. Fire-and-forget: a failed write costs a re-fetch
 * on the next load, never correctness. */
export async function putCachedItems(
  scope: string,
  receiptId: string,
  items: ReceiptItemDoc[],
): Promise<void> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return;
  try {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(items, scopedKey(scope, receiptId));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // See above.
  }
}

/** Drop everything. Paired with "Forget token": the cache holds an account's
 * purchase history, so it must not outlive that account's credential. */
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
  } catch {
    // See above.
  }
}

/**
 * Drop every account's rows except `scope`'s. Run on a token change, so one
 * account's purchase history does not sit on disk for as long as the browser
 * profile does, and so rows written before the scope existed go with it.
 */
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
  } catch {
    // See above.
  }
}
