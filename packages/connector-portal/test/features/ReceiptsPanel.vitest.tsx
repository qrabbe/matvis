import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The receipts table's states before it has rows. The panel is the portal's
 * proof that a link worked, so "no receipts yet" has to read as a next step
 * rather than as a failure.
 */

const backend = vi.hoisted(() => ({
  page: {
    results: [] as unknown[],
    status: 'Exhausted' as string,
    loadMore: (_count: number) => {},
  },
  /** Every args object the panel passed to `receipts.list`. */
  listArgs: [] as unknown[],
}));

vi.mock('convex/react', () => {
  const convex = { query: async () => null };
  return {
    useConvex: () => convex,
    usePaginatedQuery: (_reference: unknown, args: unknown) => {
      backend.listArgs.push(args);
      return backend.page;
    },
  };
});

const { ReceiptsPanel } = await import('../../src/features/ReceiptsPanel');

beforeEach(() => {
  backend.page = { results: [], status: 'Exhausted', loadMore: () => {} };
  backend.listArgs = [];
});

describe('ReceiptsPanel', () => {
  it('tells an account with no receipts what to do next', () => {
    render(<ReceiptsPanel />);

    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
    expect(screen.getByText(/Link a store and hit/)).toBeInTheDocument();
  });

  it('reads through the session when given no token', () => {
    render(<ReceiptsPanel />);
    expect(backend.listArgs[0]).toEqual({});
  });

  it('reads purely through a token when given one — the decoupled path', () => {
    render(<ReceiptsPanel token="mv_test" />);
    expect(backend.listArgs[0]).toEqual({ token: 'mv_test' });
  });

  it('offers more only while the server says there is more', () => {
    backend.page = {
      results: [],
      status: 'CanLoadMore',
      loadMore: () => {},
    };
    const { unmount } = render(<ReceiptsPanel />);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
    unmount();

    backend.page = { results: [], status: 'Exhausted', loadMore: () => {} };
    render(<ReceiptsPanel />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
