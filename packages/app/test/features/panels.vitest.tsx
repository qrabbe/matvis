import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { header, item, line, purchaseData } from '../support/fixtures';

/**
 * The empty and error states of the seven tabs.
 *
 * These are what a real account hits first — `itemGtinMap` starts empty, so
 * Pantry and Nutrition open on their empty state and stay there — and they are
 * the least likely thing to be exercised by hand, because getting back to them
 * means throwing an account's data away.
 */

// PurchasesPanel opens a modal through `useConvex`. Nothing here opens one, but
// the import has to resolve.
vi.mock('convex/react', () => ({
  useConvex: () => ({ query: async () => null }),
}));

const { ActivityPanel } = await import('../../src/features/ActivityPanel');
const { NutritionPanel } = await import('../../src/features/NutritionPanel');
const { PantryPanel } = await import('../../src/features/PantryPanel');
const { PreferencesPanel } =
  await import('../../src/features/PreferencesPanel');
const { PurchasesPanel } = await import('../../src/features/PurchasesPanel');
const { StatsPanel } = await import('../../src/features/StatsPanel');
const { UnmappedPanel } = await import('../../src/features/UnmappedPanel');

describe('ActivityPanel', () => {
  it('waits on the headers before drawing a calendar', () => {
    render(<ActivityPanel data={purchaseData({ loadingHeaders: true })} />);
    expect(screen.getByText('Loading receipts…')).toBeInTheDocument();
  });

  it('sends an account with no receipts to the portal', () => {
    render(<ActivityPanel data={purchaseData()} />);
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
  });
});

describe('StatsPanel', () => {
  it('waits on the headers', () => {
    render(<StatsPanel data={purchaseData({ loadingHeaders: true })} />);
    expect(screen.getByText('Loading receipts…')).toBeInTheDocument();
  });

  it('explains that the tab is header-derived when there are none', () => {
    render(<StatsPanel data={purchaseData()} />);
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
    expect(screen.getByText(/derived from receipt totals/)).toBeInTheDocument();
  });
});

describe('PurchasesPanel', () => {
  it('shows the shared empty state rather than a bare table', () => {
    render(<PurchasesPanel data={purchaseData()} token="token-a" />);
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
  });
});

describe('PantryPanel', () => {
  it('points at the Unmapped tab when nothing resolves to a product', () => {
    render(<PantryPanel data={purchaseData({ lines: [line()] })} />);
    expect(screen.getByText('Nothing to group yet')).toBeInTheDocument();
    expect(screen.getByText(/Unmapped tab/)).toBeInTheDocument();
  });

  it('names the missing variable when the catalog is unconfigured', () => {
    // A different failure with the same symptom, and the one a self-hoster hits.
    // Saying "nothing resolves yet" here would send them looking in the wrong
    // place entirely.
    render(<PantryPanel data={purchaseData({ catalogAvailable: false })} />);
    expect(
      screen.getByText('The catalog is not configured'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/VITE_CATALOG_CONVEX_URL is unset/),
    ).toBeInTheDocument();
  });

  it('always states the model, empty or not', () => {
    render(<PantryPanel data={purchaseData()} />);
    expect(
      screen.getByText('Inferred from purchases, not tracked'),
    ).toBeInTheDocument();
  });
});

describe('NutritionPanel', () => {
  it('holds its empty state while lines resolve but carry no nutrition', () => {
    const data = purchaseData({
      lines: [line({ product: null })],
      coverage: {
        totalLines: 1,
        matchedLines: 1,
        catalogedLines: 1,
        noNutritionLines: 1,
        notScalableLines: 0,
        nutritionLines: 0,
      },
    });
    render(<NutritionPanel data={data} />);
    expect(screen.getByText('No nutrition data yet')).toBeInTheDocument();
  });
});

describe('UnmappedPanel', () => {
  it('does not group half a load', () => {
    const data = purchaseData({ hydration: { done: 1, total: 4 } });
    render(<UnmappedPanel data={data} />);
    expect(screen.getByText('Loading line items…')).toBeInTheDocument();
  });

  it('separates "nothing loaded" from "nothing left to map"', () => {
    const { unmount } = render(<UnmappedPanel data={purchaseData()} />);
    expect(screen.getByText('No line items yet')).toBeInTheDocument();
    unmount();

    // Every line already resolves, so the table is empty for the opposite
    // reason and the coverage meter is the good news rather than the gap.
    render(<UnmappedPanel data={purchaseData({ lines: [line()] })} />);
    expect(screen.getByText('Everything is mapped')).toBeInTheDocument();
  });
});

describe('PreferencesPanel', () => {
  it('always offers a way to drop the stored credential', () => {
    render(<PreferencesPanel onForgetToken={() => {}} />);
    expect(
      screen.getByRole('button', {
        name: 'Forget token and cached receipts',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing to configure yet')).toBeInTheDocument();
  });
});

describe('a loaded account', () => {
  it('renders the tabs that are header-derived without any line items', () => {
    // Purchases, Activity and Stats are complete today precisely because they
    // never touch the product join, so they have to work on headers alone.
    const data = purchaseData({ headers: [header()] });

    const { unmount } = render(<PurchasesPanel data={data} token="token-a" />);
    expect(screen.getByText('Stora Coop')).toBeInTheDocument();
    unmount();

    render(<ActivityPanel data={data} />);
    expect(screen.getByText(/1 shopping day on record/)).toBeInTheDocument();
  });

  it('lists an unmapped line once hydration settles', () => {
    const data = purchaseData({
      lines: [line({ item: item({ text: 'BANAN 12,90' }), product: null })],
      hydration: { done: 1, total: 1 },
    });
    render(<UnmappedPanel data={data} />);
    expect(screen.getByText('BANAN 12,90')).toBeInTheDocument();
  });
});
