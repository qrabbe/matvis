import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { header, item, line, purchaseData } from '../support/fixtures';
import { ZERO_MACROS } from '../../src/lib/nutrition';

const store = vi.hoisted(() => ({ marks: [] as unknown[] }));

vi.mock('../../src/hooks/useMarks', () => ({
  useMarks: () => ({
    available: true,
    marks: store.marks,
    mark: async () => {},
    markMany: async () => {},
    unmark: async () => {},
    error: null,
  }),
}));

vi.mock('../../src/hooks/useSettings', () => ({
  useSettings: () => ({
    available: true,
    targets: [
      {
        key: 'energy',
        label: 'Energy',
        unit: 'kcal',
        enabled: true,
        value: 2500,
      },
      {
        key: 'protein',
        label: 'Protein',
        unit: 'g',
        enabled: true,
        value: 100,
      },
    ],
    setTarget: async () => {},
    error: null,
  }),
}));

const { InsightsTab } = await import('../../src/features/InsightsTab');

beforeEach(() => {
  store.marks = [];
});

describe('InsightsTab', () => {
  it('renders the weekly targets card with the marked-only caveat', () => {
    render(<InsightsTab data={purchaseData()} token="tok_a" />);
    expect(screen.getByText(/This week vs your targets/)).toBeInTheDocument();
    expect(screen.getByText(/reads low until/)).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Protein')).toBeInTheDocument();
  });

  it('counts a finished, marked unit toward this week’s total', () => {
    const l = line({
      item: item({
        lineNo: 1,
        text: 'MJÖLK',
        price: 15.95,
        gtin: '111',
        kind: 'product',
      }),
      header: header({
        _id: 'r1' as ReturnType<typeof header>['_id'],
        purchasedAt: new Date().toISOString(),
      }),
      purchasedAt: new Date(),
      macros: { ...ZERO_MACROS, kcal: 500 },
    });
    store.marks = [
      {
        _id: 'm1',
        _creationTime: 0,
        receiptId: 'r1',
        lineNo: 1,
        unitIndex: 0,
        outcome: 'finished',
        finishedAt: Date.now(),
        finishedAtHandSet: false,
        via: 'tap',
      },
    ];
    render(
      <InsightsTab
        data={purchaseData({
          lines: [l],
          linesByReceipt: new Map([['r1', [l]]]),
        })}
        token="tok_a"
      />,
    );
    expect(screen.getByText('500 / 2500 kcal')).toBeInTheDocument();
  });

  it('switches to the Spending segment', async () => {
    const user = userEvent.setup();
    render(<InsightsTab data={purchaseData()} token="tok_a" />);
    await user.click(screen.getByRole('button', { name: 'Spending' }));
    expect(screen.getByText('Total spend')).toBeInTheDocument();
  });
});
