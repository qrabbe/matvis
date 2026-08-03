import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { purchaseData } from './support/fixtures';
import type { PurchaseData } from '../src/hooks/usePurchaseData';

/**
 * The shell: the token gate, which is the whole of onboarding, and the one
 * place a load failure is ever shown.
 */

const store = vi.hoisted(() => ({
  data: null as PurchaseData | null,
  seen: [] as (string | null)[],
}));

vi.mock('../src/hooks/usePurchaseData', () => ({
  usePurchaseData: (token: string | null) => {
    store.seen.push(token);
    return store.data;
  },
}));

vi.mock('convex/react', () => ({
  useQuery: () => [],
  useConvex: () => ({ query: async () => null }),
}));

const { App } = await import('../src/App');

beforeEach(() => {
  localStorage.clear();
  store.data = purchaseData();
  store.seen = [];
});

afterEach(() => localStorage.clear());

describe('the token gate', () => {
  it('is what an unconfigured browser sees, and it points at the portal', () => {
    render(<App />);

    expect(screen.getByText('Connect your receipts')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'connector portal' }),
    ).toHaveAttribute('href', '../connector/');
    // No token, so the store is never asked for an account's receipts.
    expect(store.seen).toEqual([null]);
  });

  it('refuses an empty token and accepts anything else', async () => {
    const user = userEvent.setup();
    render(<App />);

    // `@wordpress/ui` disables accessibly — the button keeps its place in the
    // tab order and says so through aria rather than dropping out of it.
    const submit = screen.getByRole('button', { name: 'Use this token' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');

    // A token is opaque to the app — the connector mints it and only the
    // connector can judge it — so "valid" here means only "non-empty".
    await user.type(
      screen.getByLabelText('Account API token'),
      'mv_test_token',
    );
    expect(submit).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(submit);
    await waitFor(() =>
      expect(screen.queryByText('Connect your receipts')).toBeNull(),
    );
    expect(store.seen.at(-1)).toBe('mv_test_token');
  });

  it('skips straight past the gate when a token is already stored', () => {
    localStorage.setItem('matvis.app.apiToken', 'mv_stored');

    render(<App />);

    expect(screen.queryByText('Connect your receipts')).toBeNull();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(store.seen).toEqual(['mv_stored']);
  });
});

describe('the shell', () => {
  beforeEach(() => localStorage.setItem('matvis.app.apiToken', 'mv_stored'));

  it('surfaces a load failure once, above the tabs', () => {
    store.data = purchaseData({
      error: '2 receipts could not be loaded: boom',
    });

    render(<App />);

    expect(screen.getByText('Something didn’t load')).toBeInTheDocument();
    expect(
      screen.getByText('2 receipts could not be loaded: boom'),
    ).toBeInTheDocument();
  });

  it('shows first-load progress only while there is something to wait for', () => {
    store.data = purchaseData({ hydration: { done: 3, total: 10 } });

    const { unmount } = render(<App />);
    expect(screen.getByText(/Hydrating 3 of 10 receipts/)).toBeInTheDocument();
    unmount();

    // A warm cache reports n / n the moment the cache read resolves, and the
    // bar must not flash up for it.
    store.data = purchaseData({ hydration: { done: 10, total: 10 } });
    render(<App />);
    expect(screen.queryByText(/Hydrating/)).toBeNull();
  });
});
