import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex, usePaginatedQuery } from 'convex/react';
import { catalogApi } from '../lib/catalogApi';
import { catalogClient } from '../lib/catalogClient';
import { api } from '../lib/convexApi';
import {
  chunk,
  errMsg,
  MAX_EANS_PER_LOOKUP,
  type CatalogRow,
  type ReceiptHeader,
  type ReceiptItemDoc,
} from '@matvis/shared';
import {
  cacheScope,
  clearOtherScopes,
  loadCachedItems,
  putCachedItems,
} from '../lib/itemCache';
import {
  buildLines,
  computeCoverage,
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

/** How long hydrated receipts pile up in a ref before one state write lands
 * them all. A write per receipt copies an ever-growing map and re-runs every
 * memo hanging off it, so a thousand receipts stall the main thread; a flush
 * every quarter second keeps the progress bar moving without that. */
const ITEM_FLUSH_MS = 250;

/** Catalog chunks in flight at once. Each chunk is an independent read off an
 * index, so fetching them one after another only adds round trips. */
const EAN_LOOKUP_CONCURRENCY = 6;

/** Progress of the per-receipt item hydration, derived from the items in hand.
 * `total` is every known receipt and `done` those whose items have landed, so a
 * warm cache reports `n / n` the moment the cache read resolves. */
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

  const receiptIds = useMemo(
    () => (headerIds.length === 0 ? [] : headerIds.split(',')),
    [headerIds],
  );

  // ── Stage 2: line items ────────────────────────────────────────────────
  const [itemsByReceipt, setItemsByReceipt] = useState<
    Map<string, ReceiptItemDoc[]>
  >(new Map());
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Receipts whose fetch failed and which will not be asked for again this
  // session. Counted rather than retried, so the failure is visible instead of
  // silently missing from every total.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  // Derived, never accumulated: a counter that is read off the items already in
  // hand cannot drift out of step with them, whatever a run does or does not
  // finish. A failed receipt counts as done — it is finished, just empty — or
  // the progress bar never reaches its end.
  const hydration = useMemo<HydrationProgress>(
    () => ({
      total: receiptIds.length,
      done: receiptIds.filter(
        (id) => itemsByReceipt.has(id) || failedIds.has(id),
      ).length,
    }),
    [receiptIds, itemsByReceipt, failedIds],
  );

  // Receipt ids already fetched or in flight, so a re-render (or StrictMode's
  // double effect) never re-issues a query that is already resolved.
  const fetchedIds = useRef<Set<string>>(new Set());
  const cacheLoaded = useRef(false);

  // Hydrated receipts waiting for their state write, and the timer that will
  // land them. Held in refs so queueing one costs nothing and triggers no
  // render of its own.
  const pendingItems = useRef<Map<string, ReceiptItemDoc[]>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Land every queued receipt in a single state write. */
  const flushItems = useCallback(() => {
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (pendingItems.current.size === 0) return;
    const batch = pendingItems.current;
    pendingItems.current = new Map();
    setItemsByReceipt((prev) => new Map([...prev, ...batch]));
  }, []);

  /** Queue one receipt's items for the next flush. */
  const queueItems = useCallback(
    (id: string, items: ReceiptItemDoc[]) => {
      pendingItems.current.set(id, items);
      if (flushTimer.current === null) {
        flushTimer.current = setTimeout(flushItems, ITEM_FLUSH_MS);
      }
    },
    [flushItems],
  );

  // A pending flush outliving the component would write to an unmounted tree.
  useEffect(
    () => () => {
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    },
    [],
  );

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
    // Queued items belong to the previous account, so drop them unflushed.
    pendingItems.current = new Map();
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    setItemsByReceipt(new Map());
    setFailedIds(new Set());
    setFetchError(null);
    // On disk too, or the cache read two effects down hands the previous
    // account's receipts straight back.
    if (token) void cacheScope(token).then(clearOtherScopes);
  }, [token]);

  // ── The stage 2 → 3 handover ───────────────────────────────────────────
  // EANs are collected off each receipt as it lands, never rescanned off the
  // accumulated map: a memo over `itemsByReceipt` would walk every item already
  // in hand to discover the ten EANs the last batch introduced, then ask the
  // catalog for those ten. Batches go out full instead, one per fifty distinct
  // EANs, with whatever is left asked for when hydration settles.

  /** EANs already asked for, so nothing is looked up twice. */
  const fetchedEans = useRef<Set<string>>(new Set());
  /** EANs seen but not yet asked for. */
  const pendingEans = useRef<Set<string>>(new Set());
  /** Bumped when a lookup should go out: a full batch, or hydration settling. */
  const [eanRound, setEanRound] = useState(0);

  /** Queue the unseen EANs on one receipt, and ask for a lookup once a full
   * batch has piled up. */
  const collectEans = useCallback((items: readonly ReceiptItemDoc[]) => {
    for (const item of items) {
      if (!item.gtin || item.isDiscount) continue;
      if (fetchedEans.current.has(item.gtin)) continue;
      fetchedEans.current.add(item.gtin);
      pendingEans.current.add(item.gtin);
    }
    if (pendingEans.current.size >= MAX_EANS_PER_LOOKUP) {
      setEanRound((round) => round + 1);
    }
  }, []);

  /** Ask for a lookup of whatever is queued, however little. */
  const settleEans = useCallback(() => setEanRound((round) => round + 1), []);

  useEffect(() => {
    if (!token || receiptIds.length === 0) return;
    const gen = generation.current;
    const stale = () => gen !== generation.current;

    const hydrate = async () => {
      // Claimed synchronously, before the first await, so a concurrent run of
      // this effect never reads the cache a second time.
      const readCache = !cacheLoaded.current;
      cacheLoaded.current = true;

      const scope = await cacheScope(token);
      if (stale()) return;

      // Read the whole cache once, not per receipt: the immediate question is
      // which ids are MISSING, and N point reads to answer it would undo the
      // saving the cache exists for.
      if (readCache) {
        const cached = await loadCachedItems(scope);
        if (stale()) return;
        if (cached.size > 0) {
          for (const id of cached.keys()) fetchedIds.current.add(id);
          for (const items of cached.values()) collectEans(items);
          setItemsByReceipt((prev) => new Map([...prev, ...cached]));
        }
      }

      const missing = receiptIds.filter((id) => !fetchedIds.current.has(id));
      // A warm cache settles here, with every EAN it holds still queued.
      if (missing.length === 0) {
        if (!stale()) settleEans();
        return;
      }
      // Claim them up front so a concurrent run of this effect cannot double-fetch.
      for (const id of missing) fetchedIds.current.add(id);

      await mapWithConcurrency(missing, ITEM_FETCH_CONCURRENCY, async (id) => {
        if (stale()) return;
        try {
          const detail = await convex.query(api.receipts.getReceipt, {
            receiptId: id as ReceiptHeader['_id'],
            token,
          });
          const items = detail?.items ?? [];
          if (stale()) return;
          queueItems(id, items);
          collectEans(items);
          // The connector is answering again, so whatever it last said went
          // wrong is history. Only the failure count outlives a success.
          setFetchError(null);
          // Fire and forget: a failed cache write costs a re-fetch next load,
          // never correctness.
          void putCachedItems(scope, id, items);
        } catch (e) {
          // One receipt failing must not sink the other N-1. The claim stays,
          // because nothing here retries and un-claiming it would only promise
          // a later render that never comes. Count it instead, and say so.
          if (stale()) return;
          setFailedIds((prev) => new Set(prev).add(id));
          setFetchError(errMsg(e));
        }
      });

      // The last wave never reaches its timer if the run ends first, and the
      // tail of the EAN queue never reaches a full batch.
      if (!stale()) {
        flushItems();
        settleEans();
      }
    };

    void hydrate();
  }, [
    collectEans,
    convex,
    flushItems,
    queueItems,
    receiptIds,
    settleEans,
    token,
  ]);

  // ── Stage 3: products ──────────────────────────────────────────────────
  const [productsByEan, setProductsByEan] = useState<Map<string, CatalogRow[]>>(
    new Map(),
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  // Lookups in flight. Runs overlap while items stream in, so the flag has to
  // fall on the last one finishing rather than on the first.
  const productRuns = useRef(0);
  const client = catalogClient();

  useEffect(() => {
    fetchedEans.current = new Set();
    pendingEans.current = new Set();
    setProductsByEan(new Map());
  }, [token]);

  useEffect(() => {
    if (!client || pendingEans.current.size === 0) return;
    // Claimed synchronously: whatever lands while this run is in flight belongs
    // to the next one.
    const missing = [...pendingEans.current];
    pendingEans.current = new Set();

    const gen = generation.current;
    const stale = () => gen !== generation.current;
    const load = async () => {
      productRuns.current += 1;
      setLoadingProducts(true);
      try {
        // Chunked to the server's documented cap — it throws above it rather
        // than truncating, so a caller cannot believe it got a full answer — and
        // the chunks go out together, since each is an independent index read.
        await mapWithConcurrency(
          chunk(missing, MAX_EANS_PER_LOOKUP),
          EAN_LOOKUP_CONCURRENCY,
          async (batch) => {
            if (stale()) return;
            const rows = await client.query(catalogApi.catalog.getManyByEan, {
              eans: batch,
            });
            if (stale()) return;
            setProductsByEan((prev) => {
              const next = new Map(prev);
              // Seed every requested EAN, so one that simply is not catalogued
              // is remembered as "looked up, no rows" and never asked for again.
              for (const ean of batch) if (!next.has(ean)) next.set(ean, []);
              for (const row of rows) {
                next.set(row.ean, [...(next.get(row.ean) ?? []), row]);
              }
              return next;
            });
          },
        );
      } catch (e) {
        // Queue them again rather than dropping them — a catalog blip should not
        // permanently blank the product views. Nothing bumps the round here: the
        // next batch or the end of hydration retries them, where re-asking
        // immediately would spin against a catalog that is down.
        for (const ean of missing) pendingEans.current.add(ean);
        if (!stale()) setFetchError(errMsg(e));
      } finally {
        // Unconditional: a run that returns early still has to put the spinner
        // down, or it stays up with nothing behind it.
        productRuns.current -= 1;
        if (productRuns.current === 0) setLoadingProducts(false);
      }
    };

    void load();
  }, [client, eanRound]);

  // ── The join ───────────────────────────────────────────────────────────
  const lines = useMemo(
    () => buildLines(headers, itemsByReceipt, productsByEan),
    [headers, itemsByReceipt, productsByEan],
  );
  const coverage = useMemo(
    () => (lines.length === 0 ? EMPTY_COVERAGE : computeCoverage(lines)),
    [lines],
  );

  // Receipts that could not be loaded stay reported for the session, because
  // every total on every tab is short by exactly that many. A transient message
  // on top of it goes away with the next success.
  const error = useMemo(() => {
    if (failedIds.size === 0) return fetchError;
    const noun = failedIds.size === 1 ? 'receipt' : 'receipts';
    const detail = fetchError ? `: ${fetchError}` : '';
    return `${failedIds.size} ${noun} could not be loaded${detail}`;
  }, [failedIds, fetchError]);

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
