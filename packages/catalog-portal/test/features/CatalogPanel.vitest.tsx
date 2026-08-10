import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/**
 * The search box. Every distinct term is a new subscription and a fresh first
 * page, so what is worth asserting is when the term is handed to the query at
 * all: not while the typing is still going, and immediately on Enter.
 *
 * DataViews is stubbed out. It is the thing being fed, not the thing under
 * test, and rendering a data grid per keystroke would make this suite about
 * jsdom.
 */

const backend = vi.hoisted(() => ({
  searchedTerms: [] as (string | undefined)[],
}));

vi.mock('convex/react', () => ({
  usePaginatedQuery: (_reference: unknown, args: { q?: string }) => {
    const last = backend.searchedTerms.at(-1);
    if (backend.searchedTerms.length === 0 || last !== args.q) {
      backend.searchedTerms.push(args.q);
    }
    return { results: [], status: 'Exhausted', loadMore: () => {} };
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

const { CatalogPanel } = await import('../../src/features/CatalogPanel');

function type(term: string) {
  fireEvent.change(screen.getByLabelText('Search'), {
    target: { value: term },
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  backend.searchedTerms = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('typing', () => {
  it('does not search until the typing stops', () => {
    render(<CatalogPanel />);
    expect(backend.searchedTerms).toEqual([undefined]);

    type('h');
    wait(300);
    type('ha');
    wait(300);
    type('hav');
    wait(999);

    expect(backend.searchedTerms).toEqual([undefined]);
  });

  it('searches once, for the term that was left in the box', () => {
    render(<CatalogPanel />);

    type('h');
    wait(300);
    type('hav');
    wait(1000);

    expect(backend.searchedTerms).toEqual([undefined, 'hav']);
  });

  it('says it is waiting, and stops saying so once it has searched', () => {
    render(<CatalogPanel />);

    type('hav');
    expect(screen.getByText(/Press Enter to search now/)).toBeTruthy();

    wait(1000);
    expect(screen.queryByText(/Press Enter to search now/)).toBeNull();
  });
});

describe('Enter', () => {
  it('searches immediately and not a second time when the wait runs out', () => {
    render(<CatalogPanel />);

    type('hav');
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });
    expect(backend.searchedTerms).toEqual([undefined, 'hav']);

    wait(2000);
    expect(backend.searchedTerms).toEqual([undefined, 'hav']);
  });
});
