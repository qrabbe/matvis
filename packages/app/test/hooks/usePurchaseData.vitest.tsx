import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CatalogRow, ReceiptItemDoc } from '@matvis/shared';
import { header, item, product } from '../support/fixtures';

/**
 * The one join point in the app: seven tabs read from this hook and none of
 * them talks to Convex directly, so anything wrong here is wrong seven times
 * over. The three stages (headers → items → products) are all mocked at the
 * module boundary — this is a test of the store's bookkeeping, not of Convex.
 */

/** Mutable stand-ins for the two deployments, reassigned per test. `vi.hoisted`
 * because `vi.mock`'s factory is lifted above the imports. */
const backend = vi.hoisted(() => ({
  page: {
    results: [] as unknown[],
    status: 'Exhausted' as string,
    loadMore: (_count: number) => {},
  },
  /** Stands in for one `receipts.getReceipt` round trip. */
  getReceipt: async (
    _receiptId: string,
  ): Promise<{ items: ReceiptItemDoc[] } | null> => null,
  /** Stands in for one `catalog.getManyByEan` round trip, or null for an
   * unconfigured catalog. */
  catalog: null as null | ((eans: string[]) => Promise<CatalogRow[]>),
  /** Every EAN batch the catalog was asked for, in order. */
  eanCalls: [] as string[][],
}));

// Both clients are single objects, not one per render: the hook keys its
// effects on client identity, exactly as `useConvex` and the memoized catalog
// client give it, and a fresh object per render would re-fetch forever.
vi.mock('convex/react', () => {
  const convex = {
    query: (_reference: unknown, args: { receiptId: string }) =>
      backend.getReceipt(args.receiptId),
  };
  return {
    useConvex: () => convex,
    usePaginatedQuery: (_reference: unknown, args: unknown) =>
      args === 'skip'
        ? { results: [], status: 'LoadingFirstPage', loadMore: () => {} }
        : backend.page,
  };
});

const catalogStub = {
  query: (_reference: unknown, args: { eans: string[] }) => {
    backend.eanCalls.push(args.eans);
    return backend.catalog?.(args.eans) ?? Promise.resolve([]);
  },
};

vi.mock('../../src/lib/catalogClient', () => ({
  catalogClient: () => (backend.catalog ? catalogStub : null),
}));

const { usePurchaseData } = await import('../../src/hooks/usePurchaseData');

/** jsdom has no IndexedDB, so `lib/itemCache` degrades to a no-op and every
 * test starts cold. That is the path worth exercising anyway. */
beforeEach(() => {
  backend.page = { results: [], status: 'Exhausted', loadMore: () => {} };
  backend.getReceipt = async () => null;
  backend.catalog = null;
  backend.eanCalls = [];
});

describe('usePurchaseData', () => {
  it('asks for nothing without a token', async () => {
    const getReceipt = vi.fn(async () => null);
    backend.getReceipt = getReceipt;
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };

    const { result } = renderHook(() => usePurchaseData(null));

    expect(result.current.loadingHeaders).toBe(true);
    expect(getReceipt).not.toHaveBeenCalled();
  });

  it('joins headers, items and products into lines and a coverage funnel', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({
      items: [
        item({ gtin: '7311312009203', quantity: 1 }),
        item({ _id: 'item_2' as ReceiptItemDoc['_id'], lineNo: 2 }),
        item({
          _id: 'item_3' as ReceiptItemDoc['_id'],
          lineNo: 3,
          isDiscount: true,
          price: -5,
        }),
      ],
    });
    backend.catalog = async () => [product()];

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(result.current.lines).toHaveLength(2));

    // The discount line is dropped, never counted: it is a rebate against
    // another line, not a purchase of anything.
    expect(result.current.coverage).toMatchObject({
      totalLines: 2,
      matchedLines: 1,
      catalogedLines: 1,
      nutritionLines: 1,
    });
    expect(result.current.lines[0]?.product?.name).toBe('Kikärtor 500 g');
    expect(result.current.linesByReceipt.get('receipt_1')).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('reports hydration as done over total, derived from the items in hand', async () => {
    backend.page = {
      results: [
        header(),
        header({ _id: 'receipt_2' as ReturnType<typeof header>['_id'] }),
      ],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({ items: [item()] });

    const { result } = renderHook(() => usePurchaseData('token-a'));

    expect(result.current.hydration.total).toBe(2);
    await waitFor(() =>
      expect(result.current.hydration).toEqual({ done: 2, total: 2 }),
    );
  });

  it('counts a failed receipt as done and names the shortfall', async () => {
    backend.page = {
      results: [
        header(),
        header({ _id: 'receipt_2' as ReturnType<typeof header>['_id'] }),
      ],
      status: 'Exhausted',
      loadMore: () => {},
    };
    // One receipt failing must not sink the other, and the progress bar has to
    // still reach its end.
    backend.getReceipt = async (receiptId) => {
      if (receiptId === 'receipt_2') throw new Error('boom');
      return { items: [item()] };
    };

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() =>
      expect(result.current.hydration).toEqual({ done: 2, total: 2 }),
    );
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.error).toBe('1 receipt could not be loaded: boom');
  });

  it('drops the previous account when the token changes', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({ items: [item()] });

    const { result, rerender } = renderHook(
      ({ token }: { token: string }) => usePurchaseData(token),
      { initialProps: { token: 'token-a' } },
    );
    await waitFor(() => expect(result.current.lines).toHaveLength(1));

    // A different token is a different account. Anything still in memory
    // belongs to the previous one.
    backend.getReceipt = async () => {
      throw new Error('gone');
    };
    rerender({ token: 'token-b' });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.lines).toHaveLength(0);
    expect(result.current.itemsByReceipt.size).toBe(0);
  });

  it('looks each EAN up once, however many lines carry it', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({
      items: [
        item({ gtin: '7311312009203' }),
        item({ _id: 'item_2' as ReceiptItemDoc['_id'], gtin: '7311312009203' }),
        item({ _id: 'item_3' as ReceiptItemDoc['_id'], gtin: '1234567890123' }),
      ],
    });
    backend.catalog = async () => [product()];

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(result.current.loadingProducts).toBe(false));
    expect(backend.eanCalls.flat().sort()).toEqual([
      '1234567890123',
      '7311312009203',
    ]);
  });

  it('remembers an EAN the catalog has no row for, rather than re-asking', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({ items: [item({ gtin: '404' })] });
    backend.catalog = async () => [];

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.lines[0]?.product).toBeNull();
    expect(backend.eanCalls).toEqual([['404']]);
  });

  it('puts the product spinner down when the catalog lookup fails', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({
      items: [item({ gtin: '7311312009203' })],
    });
    backend.catalog = async () => {
      throw new Error('catalog down');
    };

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(result.current.error).toBe('catalog down'));
    // A run that ends early still has to clear the flag, or the spinner stays
    // up with nothing behind it.
    await waitFor(() => expect(result.current.loadingProducts).toBe(false));
    expect(result.current.lines).toHaveLength(1);
  });

  it('degrades to "receipts work, products do not" without a catalog URL', async () => {
    backend.page = {
      results: [header()],
      status: 'Exhausted',
      loadMore: () => {},
    };
    backend.getReceipt = async () => ({
      items: [item({ gtin: '7311312009203' })],
    });

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.catalogAvailable).toBe(false);
    expect(result.current.lines[0]?.product).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('drains every header page rather than waiting for a click', async () => {
    const loadMore = vi.fn();
    backend.page = { results: [header()], status: 'CanLoadMore', loadMore };

    const { result } = renderHook(() => usePurchaseData('token-a'));

    await waitFor(() => expect(loadMore).toHaveBeenCalled());
    expect(result.current.loadingMoreHeaders).toBe(true);
  });
});
