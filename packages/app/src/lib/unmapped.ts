import { normalizeItemText } from '@matvis/shared';
import type { PurchaseLine } from './purchases';

export interface UnmappedGroup {
  key: string;
  text: string;
  count: number;
  spend: number;
  firstSeen: Date;
  lastSeen: Date;
  minPrice: number;
  maxPrice: number;
  priceGroups: PriceGroup[];
}

export interface PriceGroup {
  price: number;
  count: number;
}

export function groupUnmapped(lines: readonly PurchaseLine[]): UnmappedGroup[] {
  const groups = new Map<string, UnmappedGroup>();

  for (const line of lines) {
    if (line.product) continue;
    const key = normalizeItemText(line.item.text);
    if (!key) continue;
    const price = line.item.price;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        text: line.item.text,
        count: 1,
        spend: price,
        firstSeen: line.purchasedAt,
        lastSeen: line.purchasedAt,
        minPrice: price,
        maxPrice: price,
        priceGroups: [{ price, count: 1 }],
      });
      continue;
    }

    existing.count += 1;
    existing.spend += price;
    if (line.purchasedAt < existing.firstSeen) {
      existing.firstSeen = line.purchasedAt;
    }
    if (line.purchasedAt > existing.lastSeen) {
      existing.lastSeen = line.purchasedAt;
      existing.text = line.item.text;
    }
    if (price < existing.minPrice) existing.minPrice = price;
    if (price > existing.maxPrice) existing.maxPrice = price;

    // Update price groups
    const priceGroup = existing.priceGroups.find((pg) => pg.price === price);
    if (priceGroup) {
      priceGroup.count += 1;
    } else {
      existing.priceGroups.push({ price, count: 1 });
    }
  }

  return [...groups.values()].sort((a, b) => b.spend - a.spend);
}

/** Normalize text for search: strip trailing price and clean whitespace. */
export function normalizeForSearch(text: string): string {
  // Strip any trailing price pattern (e.g. " 35,50" or " 35.50")
  const noPrice = text.replace(/\s+[\d,\.]+\s*$/, '').trim();
  return noPrice;
}

export function catalogSearchHref(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/#/`;
}
