import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The Coop | ICA tabs and the search field they share. DataViews and the
 * paginated query are stubbed out: what is worth asserting here is which
 * store and term the route ends up carrying, not how the product list renders.
 */

const backend = vi.hoisted(() => ({
  searches: [] as { store: string; q: string | undefined }[],
  categoryLevels: [] as { store: string; parentSlug: string }[],
  navigated: [] as string[],
}));

vi.mock('convex/react', () => ({
  usePaginatedQuery: (
    _reference: unknown,
    args: { store: string; q?: string },
  ) => {
    backend.searches.push({ store: args.store, q: args.q });
    return { results: [], status: 'Exhausted', loadMore: () => {} };
  },
  useQuery: (
    _reference: unknown,
    args: { store: string; parentSlug: string },
  ) => {
    backend.categoryLevels.push(args);
    return [];
  },
  useMutation: () => async () => undefined,
}));

vi.mock('@wordpress/dataviews', () => ({
  DataViews: () => null,
  filterSortAndPaginate: (data: unknown[]) => ({
    data,
    paginationInfo: { totalItems: data.length, totalPages: 1 },
  }),
}));

vi.mock('../../src/lib/route', async () => {
  const actual = await vi.importActual<object>('../../src/lib/route');
  return {
    ...actual,
    navigate: (path: string) => backend.navigated.push(path),
  };
});

const { CatalogTab } = await import('../../src/features/CatalogTab');

beforeEach(() => {
  backend.searches = [];
  backend.categoryLevels = [];
  backend.navigated = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function lastSearch() {
  return backend.searches.at(-1);
}

describe('search results, in place', () => {
  it('queries the store on the route with the term on the route', () => {
    render(<CatalogTab path="/s/coop?q=mj%C3%B6lk" />);
    expect(lastSearch()).toEqual({ store: 'coop', q: 'mjölk' });
  });

  it("browses a chain's front page instead of searching it", () => {
    render(<CatalogTab path="/c/ica" />);
    expect(backend.categoryLevels.at(-1)).toEqual({
      store: 'ica',
      parentSlug: '',
    });
    expect(backend.searches).toEqual([]);
  });
});

describe('switching Coop | ICA', () => {
  it('reruns the same term in the other chain', () => {
    render(<CatalogTab path="/s/coop?q=mj%C3%B6lk" />);

    fireEvent.click(screen.getByRole('tab', { name: 'ICA' }));

    expect(backend.navigated.at(-1)).toBe('/s/ica?q=mj%C3%B6lk');
  });

  it('moves between front pages when there is no search', () => {
    render(<CatalogTab path="/" />);

    fireEvent.click(screen.getByRole('tab', { name: 'ICA' }));

    expect(backend.navigated.at(-1)).toBe('/c/ica');
  });
});

describe('the search field', () => {
  it('searches once typing settles, and not while it is still going', () => {
    render(<CatalogTab path="/" />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'mjöl' },
    });
    expect(backend.navigated).toEqual([]);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'mjölk' },
    });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });

    expect(backend.navigated.at(-1)).toBe('/s/coop?q=mj%C3%B6lk');
  });

  it('clearing it returns to the store front page', () => {
    render(<CatalogTab path="/s/coop?q=mj%C3%B6lk" />);

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(backend.navigated.at(-1)).toBe('/');
  });
});
