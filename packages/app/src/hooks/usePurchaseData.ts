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

const ITEM_FETCH_CONCURRENCY = 4;

const HEADER_PAGE_SIZE = 200;

const ITEM_FLUSH_MS = 250;

const EAN_LOOKUP_CONCURRENCY = 6;

export interface HydrationProgress {
  done: number;
  total: number;
}

export interface PurchaseData {
  headers: ReceiptHeader[];
  lines: PurchaseLine[];
  linesByReceipt: Map<string, PurchaseLine[]>;
  itemsByReceipt: Map<string, ReceiptItemDoc[]>;
  coverage: Coverage;
  loadingHeaders: boolean;
  loadingMoreHeaders: boolean;
  hydration: HydrationProgress;
  loadingProducts: boolean;
  catalogAvailable: boolean;
  error: string | null;
}

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

  const {
    results: headers,
    status: headerStatus,
    loadMore,
  } = usePaginatedQuery(api.receipts.list, token ? { token } : 'skip', {
    initialNumItems: HEADER_PAGE_SIZE,
  });

  useEffect(() => {
    if (headerStatus === 'CanLoadMore') loadMore(HEADER_PAGE_SIZE);
  }, [headerStatus, loadMore]);

  const headerIds = useMemo(
    () => headers.map((header) => header._id).join(','),
    [headers],
  );

  const receiptIds = useMemo(
    () => (headerIds.length === 0 ? [] : headerIds.split(',')),
    [headerIds],
  );

  const [itemsByReceipt, setItemsByReceipt] = useState<
    Map<string, ReceiptItemDoc[]>
  >(new Map());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const hydration = useMemo<HydrationProgress>(
    () => ({
      total: receiptIds.length,
      done: receiptIds.filter(
        (id) => itemsByReceipt.has(id) || failedIds.has(id),
      ).length,
    }),
    [receiptIds, itemsByReceipt, failedIds],
  );

  const fetchedIds = useRef<Set<string>>(new Set());
  const cacheLoaded = useRef(false);

  const pendingItems = useRef<Map<string, ReceiptItemDoc[]>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const queueItems = useCallback(
    (id: string, items: ReceiptItemDoc[]) => {
      pendingItems.current.set(id, items);
      if (flushTimer.current === null) {
        flushTimer.current = setTimeout(flushItems, ITEM_FLUSH_MS);
      }
    },
    [flushItems],
  );

  useEffect(
    () => () => {
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    },
    [],
  );

  // A changed token means a different account, so everything in memory has to
  // go or the new account inherits the previous one's receipts.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    fetchedIds.current = new Set();
    cacheLoaded.current = false;
    pendingItems.current = new Map();
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    setItemsByReceipt(new Map());
    setFailedIds(new Set());
    setFetchError(null);
    if (token) void cacheScope(token).then(clearOtherScopes);
  }, [token]);

  const fetchedEans = useRef<Set<string>>(new Set());
  const pendingEans = useRef<Set<string>>(new Set());
  const [eanRound, setEanRound] = useState(0);

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

  const settleEans = useCallback(() => setEanRound((round) => round + 1), []);

  useEffect(() => {
    if (!token || receiptIds.length === 0) return;
    const gen = generation.current;
    const stale = () => gen !== generation.current;

    const hydrate = async () => {
      const readCache = !cacheLoaded.current;
      cacheLoaded.current = true;

      const scope = await cacheScope(token);
      if (stale()) return;

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
      if (missing.length === 0) {
        if (!stale()) settleEans();
        return;
      }
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
          setFetchError(null);
          void putCachedItems(scope, id, items);
        } catch (e) {
          if (stale()) return;
          setFailedIds((prev) => new Set(prev).add(id));
          setFetchError(errMsg(e));
        }
      });

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

  const [productsByEan, setProductsByEan] = useState<Map<string, CatalogRow[]>>(
    new Map(),
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  const productRuns = useRef(0);
  const client = catalogClient();

  useEffect(() => {
    fetchedEans.current = new Set();
    pendingEans.current = new Set();
    setProductsByEan(new Map());
  }, [token]);

  useEffect(() => {
    if (!client || pendingEans.current.size === 0) return;
    const missing = [...pendingEans.current];
    pendingEans.current = new Set();

    const gen = generation.current;
    const stale = () => gen !== generation.current;
    const load = async () => {
      productRuns.current += 1;
      setLoadingProducts(true);
      try {
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
              for (const ean of batch) if (!next.has(ean)) next.set(ean, []);
              for (const row of rows) {
                next.set(row.ean, [...(next.get(row.ean) ?? []), row]);
              }
              return next;
            });
          },
        );
      } catch (e) {
        for (const ean of missing) pendingEans.current.add(ean);
        if (!stale()) setFetchError(errMsg(e));
      } finally {
        productRuns.current -= 1;
        if (productRuns.current === 0) setLoadingProducts(false);
      }
    };

    void load();
  }, [client, eanRound]);

  const { lines, linesByReceipt } = useMemo(
    () => buildLines(headers, itemsByReceipt, productsByEan),
    [headers, itemsByReceipt, productsByEan],
  );
  const coverage = useMemo(
    () => (lines.length === 0 ? EMPTY_COVERAGE : computeCoverage(lines)),
    [lines],
  );

  const error = useMemo(() => {
    if (failedIds.size === 0) return fetchError;
    const noun = failedIds.size === 1 ? 'receipt' : 'receipts';
    const detail = fetchError ? `: ${fetchError}` : '';
    return `${failedIds.size} ${noun} could not be loaded${detail}`;
  }, [failedIds, fetchError]);

  return {
    headers,
    lines,
    linesByReceipt,
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
