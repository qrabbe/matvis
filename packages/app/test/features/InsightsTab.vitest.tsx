import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReceiptItemDoc } from '@matvis/shared';
import {
  header,
  item,
  line,
  markRow,
  product,
  purchaseData,
} from '../support/fixtures';
import { ZERO_MACROS, type Macros } from '../../src/lib/nutrition';
import { TARGET_DEFINITIONS, type TargetKey } from '../../src/lib/targets';
import type { MarkRow } from '../../src/lib/appBackendApi';
import type { PurchaseLine } from '../../src/lib/purchases';

const store = vi.hoisted(() => ({
  marks: [] as unknown[],
  off: [] as string[],
}));

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
    targets: (Object.keys(TARGET_DEFINITIONS) as TargetKey[]).map((key) => ({
      key,
      ...TARGET_DEFINITIONS[key],
      enabled: !store.off.includes(key),
      value: TARGET_DEFINITIONS[key].defaultValue,
    })),
    setTarget: async () => {},
    error: null,
  }),
}));

const { InsightsTab } = await import('../../src/features/InsightsTab');

// A fixed Friday so "this week" always has a known, stable elapsed-day count
// (Monday 21st through Friday 25th) regardless of when the suite runs.
const today = new Date(2026, 8, 25, 9);
const todayNoon = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  12,
);

let lineNo = 0;

function eaten(
  name: string,
  macros: Partial<Macros>,
  opts: {
    price?: number;
    quantity?: number;
    categoryPath?: string[];
    daysAgo?: number;
  } = {},
): PurchaseLine {
  lineNo += 1;
  return line({
    item: item({
      _id: `item_${lineNo}` as ReceiptItemDoc['_id'],
      receiptId: 'r1' as ReceiptItemDoc['receiptId'],
      lineNo,
      text: name.toUpperCase(),
      price: opts.price ?? 20,
      gtin: `ean_${name}`,
      kind: 'product',
      ...(opts.quantity ? { quantity: opts.quantity, unit: 'st' } : {}),
    }),
    header: header({
      _id: 'r1' as ReturnType<typeof header>['_id'],
      purchasedAt: new Date(
        todayNoon.getTime() - (opts.daysAgo ?? 0) * 86_400_000,
      ).toISOString(),
    }),
    product: product({
      ean: `ean_${name}`,
      name,
      ...(opts.categoryPath ? { categoryPath: opts.categoryPath } : {}),
    }),
    macros: { ...ZERO_MACROS, ...macros },
  });
}

function finished(l: PurchaseLine, overrides: Partial<MarkRow> = {}): MarkRow {
  return markRow({
    receiptId: 'r1',
    lineNo: l.item.lineNo,
    unitIndex: 0,
    finishedAt: todayNoon.getTime(),
    ...overrides,
  });
}

function renderWith(
  lines: PurchaseLine[],
  items: ReceiptItemDoc[] = lines.map((l) => l.item),
) {
  return render(
    <InsightsTab
      data={purchaseData({
        lines,
        linesByReceipt: new Map([['r1', lines]]),
        itemsByReceipt: new Map([['r1', items]]),
      })}
      token="tok_a"
      today={today}
    />,
  );
}

function targetsCard() {
  return within(
    screen.getByText('Per day vs your targets').closest('section')!,
  );
}

beforeEach(() => {
  store.marks = [];
  store.off = [];
});

describe('InsightsTab', () => {
  it('opens on this week, per day', () => {
    renderWith([]);
    expect(screen.getByText('Per day vs your targets')).toBeInTheDocument();
    expect(targetsCard().getByText('Saturated fat')).toBeInTheDocument();
  });

  it('averages this week per day instead of summing it', () => {
    // 700 kcal on Friday the 25th, spread over the 5 elapsed days since
    // Monday the 21st (the week isn't over yet).
    const milk = eaten('Milk', { kcal: 700 });
    store.marks = [finished(milk)];
    renderWith([milk]);
    expect(screen.getByText(`140 / 2 500 kcal`)).toBeInTheDocument();
  });

  it('moves to the previous period with the back arrow', async () => {
    const user = userEvent.setup();
    const milk = eaten('Milk', { kcal: 700 });
    store.marks = [finished(milk)];
    renderWith([milk]);
    await user.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(screen.getByText(`0 / 2 500 kcal`)).toBeInTheDocument();
  });

  it('switches to the Month timeframe', async () => {
    const user = userEvent.setup();
    const milk = eaten('Milk', { kcal: 700 });
    store.marks = [finished(milk)];
    renderWith([milk]);
    await user.click(screen.getByRole('button', { name: 'Month' }));
    // Same day's intake, just averaged over the elapsed days of the month.
    expect(targetsCard().getByText(/2 500 kcal/)).toBeInTheDocument();
  });

  it('drops a target that is turned off', () => {
    store.off = ['salt'];
    renderWith([]);
    expect(targetsCard().queryByText('Salt')).not.toBeInTheDocument();
    expect(targetsCard().getByText('Fibre')).toBeInTheDocument();
  });

  it('writes floors and ceilings as min and max', () => {
    renderWith([]);
    expect(screen.getByText('0 / min 35 g')).toBeInTheDocument();
    expect(screen.getByText('0 / max 6 g')).toBeInTheDocument();
  });

  it('shows where protein came from as shares, folding the long tail', () => {
    const lines = [
      eaten('Eggs', { protein: 40 }),
      eaten('Oats', { protein: 20 }),
      eaten('Milk', { protein: 20 }),
      eaten('Quark', { protein: 12 }),
      eaten('Bread', { protein: 5 }),
      eaten('Cheese', { protein: 3 }),
    ];
    store.marks = lines.map((l) => finished(l));
    renderWith(lines);
    const card = screen.getByText('Protein came from').closest('section')!;
    expect(within(card).getByText('Eggs')).toBeInTheDocument();
    expect(within(card).getByText('40%')).toBeInTheDocument();
    expect(within(card).getByText('2 other products')).toBeInTheDocument();
    expect(within(card).getByText('8%')).toBeInTheDocument();
  });

  it('switches the sources card to another nutrient', async () => {
    const user = userEvent.setup();
    const chips = eaten('Chips', { salt: 3, protein: 1 });
    const eggs = eaten('Eggs', { salt: 1, protein: 12 });
    store.marks = [finished(chips), finished(eggs)];
    renderWith([chips, eggs]);
    await user.selectOptions(screen.getByLabelText('Nutrient'), 'salt');
    const card = screen.getByText('Salt came from').closest('section')!;
    expect(within(card).getByText('75%')).toBeInTheDocument();
  });

  it('charges waste per package, net of the discount under the line', () => {
    const yoghurt = eaten('Vaniljyoghurt', {}, { price: 40, quantity: 4 });
    const discount = item({
      _id: 'item_discount' as ReceiptItemDoc['_id'],
      receiptId: 'r1' as ReceiptItemDoc['receiptId'],
      lineNo: yoghurt.item.lineNo + 1,
      text: 'RABATT',
      price: -8,
      isDiscount: true,
    });
    store.marks = [
      finished(yoghurt, { outcome: 'wasted', unitIndex: 0 }),
      finished(yoghurt, { outcome: 'wasted', unitIndex: 1 }),
    ];
    renderWith([yoghurt], [yoghurt.item, discount]);
    const card = screen.getByText('Thrown away').closest('section')!;
    expect(within(card).getByText('16')).toBeInTheDocument();
    expect(within(card).getByText('Vaniljyoghurt ×2')).toBeInTheDocument();
  });

  it('reads out a tapped bar', async () => {
    const user = userEvent.setup();
    const milk = eaten('Milk', { kcal: 700 });
    store.marks = [finished(milk)];
    const { container } = renderWith([milk]);
    const hitAreas = container.querySelectorAll('svg rect[fill="transparent"]');
    await user.click(hitAreas[hitAreas.length - 1]!);
    expect(screen.getByText(/700 kcal marked/)).toBeInTheDocument();
  });
});
