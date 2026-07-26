import { describe, expect, it } from 'bun:test';
import type { CatalogRow } from '../../src/lib/catalogApi';
import type { ReceiptHeader, ReceiptItemDoc } from '../../src/lib/convexApi';
import type { PurchaseLine } from '../../src/lib/purchases';
import { catalogSearchHref, groupUnmapped } from '../../src/lib/unmapped';

function line(
  text: string,
  price: number,
  day: string,
  product: CatalogRow | null = null,
): PurchaseLine {
  const purchasedAt = new Date(`${day}T12:00:00`);
  return {
    item: {
      _id: `${text}-${day}` as ReceiptItemDoc['_id'],
      _creationTime: 0,
      receiptId: 'r1' as ReceiptItemDoc['receiptId'],
      lineNo: 1,
      text,
      price,
      isDiscount: false,
    },
    header: {} as ReceiptHeader,
    day,
    purchasedAt,
    product,
    macros: null,
  };
}

describe('groupUnmapped', () => {
  it('groups by the matcher’s own normalization key, so a group is one future mapping', () => {
    // Same product, different printed prices — `normalizeItemText` strips the
    // trailing price, which is the whole reason these collapse into one row.
    const groups = groupUnmapped([
      line('PESTO PEPERONICO 32,95', 32.95, '2026-03-01'),
      line('PESTO PEPERONICO 29,50', 29.5, '2026-03-08'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('pesto peperonico');
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.spend).toBeCloseTo(62.45, 6);
  });

  it('tracks the price range and the first/last time it was seen', () => {
    const [group] = groupUnmapped([
      line('MJÖLK 12,00', 12, '2026-03-08'),
      line('MJÖLK 15,00', 15, '2026-03-01'),
    ]);
    expect(group?.minPrice).toBe(12);
    expect(group?.maxPrice).toBe(15);
    expect(group?.firstSeen.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(group?.lastSeen.toISOString().slice(0, 10)).toBe('2026-03-08');
  });

  it('keeps the most recently printed spelling for display', () => {
    const [group] = groupUnmapped([
      line('BANAN EKO 10,00', 10, '2026-03-01'),
      line('Banan Eko 11,00', 11, '2026-03-09'),
    ]);
    expect(group?.text).toBe('Banan Eko 11,00');
  });

  it('excludes lines that did resolve to a product', () => {
    const product = { ean: '111', name: 'Pesto' } as CatalogRow;
    const groups = groupUnmapped([
      line('PESTO 32,95', 32.95, '2026-03-01', product),
      line('OKÄND VARA 9,00', 9, '2026-03-01'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('okänd vara');
  });

  it('sorts the biggest gaps first', () => {
    const groups = groupUnmapped([
      line('SÄLLAN 5,00', 5, '2026-03-01'),
      line('OFTA 5,00', 5, '2026-03-01'),
      line('OFTA 5,00', 5, '2026-03-02'),
      line('OFTA 5,00', 5, '2026-03-03'),
    ]);
    expect(groups[0]?.key).toBe('ofta');
    expect(groups[0]?.count).toBe(3);
  });
});

describe('catalogSearchHref', () => {
  it('points at the catalog portal’s hash route, with no trailing-slash doubling', () => {
    expect(catalogSearchHref('../catalog')).toBe('../catalog/#/');
    expect(catalogSearchHref('../catalog/')).toBe('../catalog/#/');
  });
});
