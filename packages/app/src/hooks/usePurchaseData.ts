import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex, usePaginatedQuery } from 'convex/react';
import {
  catalogApi,
  MAX_EANS_PER_LOOKUP,
  type CatalogRow,
} from '../lib/catalogApi';
import { catalogClient } from '../lib/catalogClient';
import { api, type ReceiptHeader, type ReceiptItemDoc } from '../lib/convexApi';
import { errMsg } from '../lib/format';
import { loadCachedItems, putCachedItems } from '../lib/itemCache';
import {
  buildLines,
  chunk,
  computeCoverage,
  distinctGtins,
  EMPTY_COVERAGE,
  type Coverage,
  type PurchaseLine,
} from '../lib/purchases';

/**
 * The purchase store: one hook, one cache, seven consumers.
 *
 * Every tab reads from here and no tab talks to Convex directly. That is the
 * single biggest structural difference from the old repo, where four pages each
 * re-fetched every line item and each re-derived its own numbers — which is how
 * two screens end up disagreeing about how much you spent.
 *
 * Three stages, in order, each usable before the next finishes:
 *
 * 1. **Headers** — reactive and paginated off the connector. A background sync
 *    in the portal makes new receipts appear here live.
 * 2. **Items** — one imperative `getReceipt` per receipt not already in
 *    IndexedDB, at a small concurrency limit. Receipts are immutable, so the
 *    cache never needs invalidating and later loads cost roughly nothing.
 * 3. **Products** — the distinct EANs, chunked and fetched from the CATALOG
 *    deployment's own client.
 *
 * Stage 2's fan-out exists because the connector has no cross-receipt item
 * query (`receiptItems` only has a `by_receipt` index). A single paginated
 * `receipts.itemsPage` would collapse it to a handful of round trips, but that
 * is a change to packages/connector and a performance follow-up, not a
 * prerequisite. Revisit past ~500 receipts.
 */

/** Concurrent `getReceipt` calls during first-load hydration. Deliberately
 * small: the point is a progress bar that moves, not saturating the deployment
 * on behalf of one browser tab. */
const ITEM_FETCH_CONCURRENCY = 4;

/** Receipt headers pulled per page. Headers are small and we drain every page
 * anyway, so a large page means fewer round trips; the reactive subscription
 * then covers the range once. */
const HEADER_PAGE_SIZE = 200;

/** Progress of the per-receipt item hydration. `total` is the number of
 * receipts that needed fetching this session, so a warm cache reports `0 / 0`. */
export interface HydrationProgress {
  done: number;
  total: number;
}

export interface PurchaseData {
  /** Receipt headers, newest first. Available before items finish loading, so
   * the header-only tabs (Activity, Stats, Purchases) render immediately. */
  headers: ReceiptHeader[];
  /** Every non-discount line, joined to its product where one exists. */
  lines: PurchaseLine[];
  /** Line items by receipt `_id`, for the per-receipt views. */
  itemsByReceipt: Map<string, ReceiptItemDoc[]>;
  coverage: Coverage;
  /** True until the first page of headers has landed. */
  loadingHeaders: boolean;
  /** True while more header pages are still being drained. */
  loadingMoreHeaders: boolean;
  hydration: HydrationProgress;
  /** True while EANs are being looked up on the catalog deployment. */
  loadingProducts: boolean;
  /** False when `VITE_CATALOG_CONVEX_URL` is unset — product views degrade to
   * their empty state instead of erroring. */
  catalogAvailable: boolean;
  error: string | null;
}

/** Run `task` over `values` with at most `limit` in flight. */
async function mapWithConcurrency<T>(
  values: readonly T[],
  limit: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, () =>
    (async () => {
      for (;;) {
        const index = cursor++;
        const value = values[index];
        if (value === undefined) return;
        await task(value);
      }
    })(),
  );
  await Promise.all(workers);
}

export function usePurchaseData(token: string | null): PurchaseData {
  const convex = useConvex();

  // ── Stage 1: headers ───────────────────────────────────────────────────
  // Skipped entirely without a token: the read API would resolve no account and
  // return an empty page, but not asking is clearer than asking for nothing.
  const {
    results: headers,
    status: headerStatus,
    loadMore,
  } = usePaginatedQuery(api.receipts.list, token ? { token } : 'skip', {
    initialNumItems: HEADER_PAGE_SIZE,
  });

  // Drain every page. The tabs that need all line items need all headers first,
  // and headers are cheap enough that a "load more" button would just be a
  // chore the user has to click before the app works.
  useEffect(() => {
    if (headerStatus === 'CanLoadMore') loadMore(HEADER_PAGE_SIZE);
  }, [headerStatus, loadMore]);

  // The stable identity of the header set. `results` is a fresh array on every
  // page arrival, so effects key off this instead and re-run only when the set
  // of receipts actually changes — not on every reactive re-render.
  const headerIds = useMemo(
    () => headers.map((header) => header._id).join(','),
    [headers],
  );

  // ── Stage 2: line items ────────────────────────────────────────────────
  const [itemsByReceipt, setItemsByReceipt] = useState<
    Map<string, ReceiptItemDoc[]>
  >(new Map());
  const [hydration, setHydration] = useState<HydrationProgress>({
    done: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // Receipt ids already fetched or in flight, so a re-render (or StrictMode's
  // double effect) never re-issues a query that is already resolved.
  const fetchedIds = useRef<Set<string>>(new Set());
  const cacheLoaded = useRef(false);

  // Bumped only when the account changes. A run claims its receipt ids up
  // front, so abandoning it mid-flight would strand them claimed but unfetched
  // and no later run would ask again. A `getReceipt` result stays valid when
  // another header page arrives, so a run drains to the end and only its state
  // writes are dropped, and only when the account it belongs to is gone.
  const generation = useRef(0);

  // Changing token means a different account: everything in memory belongs to
  // the previous one and must go, or the new account inherits its receipts.
  useEffect(() => {
    generation.current += 1;
    fetchedIds.current = new Set();
    cacheLoaded.current = false;
    setItemsByReceipt(new Map());
    setHydration({ done: 0, total: 0 });
    setError(null);
  }, [token]);

  useEffect(() => {
    if (!token || headerIds.length === 0) return;
    const ids = headerIds.split(',');
    const gen = generation.current;
    const stale = () => gen !== generation.current;

    const hydrate = async () => {
      // Read the whole cache once, not per receipt: the immediate question is
      // which ids are MISSING, and N point reads to answer it would undo the
      // saving the cache exists for.
      if (!cacheLoaded.current) {
        cacheLoaded.current = true;
        const cached = await loadCachedItems();
        if (stale()) return;
        if (cached.size > 0) {
          for (const id of cached.keys()) fetchedIds.current.add(id);
          setItemsByReceipt((prev) => new Map([...prev, ...cached]));
        }
      }

      const missing = ids.filter((id) => !fetchedIds.current.has(id));
      if (missing.length === 0) return;
      // Claim them up front so a concurrent run of this effect cannot double-fetch.
      for (const id of missing) fetchedIds.current.add(id);

      setHydration((prev) => ({
        done: prev.done,
        total: prev.total + missing.length,
      }));

      await mapWithConcurrency(missing, ITEM_FETCH_CONCURRENCY, async (id) => {
        if (stale()) return;
        try {
          const detail = await convex.query(api.receipts.getReceipt, {
            receiptId: id as ReceiptHeader['_id'],
            token,
          });
          const items = detail?.items ?? [];
          if (stale()) return;
          setItemsByReceipt((prev) => new Map(prev).set(id, items));
          // Fire and forget: a failed cache write costs a re-fetch next load,
          // never correctness.
          void putCachedItems(id, items);
        } catch (e) {
          // One receipt failing must not sink the other N-1. Un-claim it so a
          // later render retries, and surface the message once.
          fetchedIds.current.delete(id);
          if (!stale()) setError(errMsg(e));
        } finally {
          if (!stale()) {
            setHydration((prev) => ({ ...prev, done: prev.done + 1 }));
          }
        }
      });
    };

    void hydrate();
  }, [convex, headerIds, token]);

  // ── Stage 3: products ──────────────────────────────────────────────────
  const [productsByEan, setProductsByEan] = useState<Map<string, CatalogRow[]>>(
    new Map(),
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  const fetchedEans = useRef<Set<string>>(new Set());
  const client = catalogClient();

  useEffect(() => {
    fetchedEans.current = new Set();
    setProductsByEan(new Map());
  }, [token]);

  const wantedEans = useMemo(
    () => distinctGtins(itemsByReceipt),
    [itemsByReceipt],
  );

  useEffect(() => {
    if (!client || wantedEans.length === 0) return;
    const missing = wantedEans.filter((ean) => !fetchedEans.current.has(ean));
    if (missing.length === 0) return;
    for (const ean of missing) fetchedEans.current.add(ean);

    const gen = generation.current;
    const stale = () => gen !== generation.current;
    const load = async () => {
      setLoadingProducts(true);
      try {
        // Chunked to the server's documented cap — it throws above it rather
        // than truncating, so a caller cannot believe it got a full answer.
        for (const batch of chunk(missing, MAX_EANS_PER_LOOKUP)) {
          if (stale()) return;
          const rows = await client.query(catalogApi.catalog.getManyByEan, {
            eans: batch,
          });
          if (stale()) return;
          setProductsByEan((prev) => {
            const next = new Map(prev);
            // Seed every requested EAN, so one that simply is not catalogued is
            // remembered as "looked up, no rows" and never asked for again.
            for (const ean of batch) if (!next.has(ean)) next.set(ean, []);
            for (const row of rows) {
              next.set(row.ean, [...(next.get(row.ean) ?? []), row]);
            }
            return next;
          });
        }
      } catch (e) {
        // Let them be retried — a catalog blip should not permanently blank the
        // product views.
        for (const ean of missing) fetchedEans.current.delete(ean);
        if (!stale()) setError(errMsg(e));
      } finally {
        if (!stale()) setLoadingProducts(false);
      }
    };

    void load();
  }, [client, wantedEans]);

  // ── The join ───────────────────────────────────────────────────────────
  const lines = useMemo(
    () => buildLines(headers, itemsByReceipt, productsByEan),
    [headers, itemsByReceipt, productsByEan],
  );
  const coverage = useMemo(
    () => (lines.length === 0 ? EMPTY_COVERAGE : computeCoverage(lines)),
    [lines],
  );

  return {
    headers,
    lines,
    itemsByReceipt,
    coverage,
    loadingHeaders: headerStatus === 'LoadingFirstPage',
    loadingMoreHeaders:
      headerStatus === 'LoadingMore' || headerStatus === 'CanLoadMore',
    hydration,
    loadingProducts,
    catalogAvailable: client !== null,
    error,
  };
}

/** Stable, empty purchase data — what the tabs render against before a token is
 * pasted, so no tab needs a null check of its own. */
export function useEmptyPurchaseData(): PurchaseData {
  return useMemo(
    () => ({
      headers: [],
      lines: [],
      itemsByReceipt: new Map(),
      coverage: EMPTY_COVERAGE,
      loadingHeaders: false,
      loadingMoreHeaders: false,
      hydration: { done: 0, total: 0 },
      loadingProducts: false,
      catalogAvailable: false,
      error: null,
    }),
    [],
  );
}
