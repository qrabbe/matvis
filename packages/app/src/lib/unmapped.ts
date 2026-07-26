import { normalizeItemText } from '@matvis/connector';
import type { PurchaseLine } from './purchases';

/**
 * The unmatched-line rollup: which printed texts the account keeps buying that
 * nothing has an EAN for. Pure.
 *
 * This is the honest measure of how much of the app is real. `itemGtinMap`
 * starts empty and nothing fills it yet, so today essentially every line lands
 * here — which makes this the most valuable tab at launch, and the reason the
 * global coverage meter lives on it.
 *
 * Grouping goes through {@link normalizeItemText}, imported from
 * `@matvis/connector`'s **src** (a pure function, not a backend call). Using the
 * matcher's own key is the whole point: a group here is exactly one future
 * `itemGtinMap` row, so the counts say precisely how much coverage one mapping
 * would buy. Re-implementing the normalization locally would silently split or
 * merge groups the matcher would not.
 */

/** One normalized line text, rolled up across every receipt that printed it. */
export interface UnmappedGroup {
  /** The `normalizeItemText` key — one future `itemGtinMap` row. */
  key: string;
  /** The text as most recently printed, for display. */
  text: string;
  /** How many receipt lines printed it. */
  count: number;
  /** Total spend across those lines. */
  spend: number;
  firstSeen: Date;
  lastSeen: Date;
  minPrice: number;
  maxPrice: number;
}

/**
 * Roll unmatched non-discount lines up by normalized text. A line is
 * "unmatched" when it carries no `gtin` at all, OR when its EAN resolves to no
 * catalog row — from the user's point of view both mean "we cannot tell you
 * anything about this", and separating them would just split the gap into two
 * lists neither of which is the real total.
 */
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
      // Keep the most recently printed spelling: if a chain changes how it
      // prints a product, the current wording is the one worth searching for.
      existing.text = line.item.text;
    }
    if (price < existing.minPrice) existing.minPrice = price;
    if (price > existing.maxPrice) existing.maxPrice = price;
  }

  // Biggest gaps first, so the rows worth mapping sort to the top by default.
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * Where to send someone who wants to look a group's text up in the catalog. A
 * LINK, not a mapping — this tab creates nothing, per the read-only scope.
 *
 * It points at the catalog portal's search TAB, not at a pre-filled query: the
 * portal's search box is local component state and nothing there reads a term
 * off the URL, so a `?q=…` deep link would land on an empty box and quietly do
 * nothing. Rather than ship an affordance that looks like it works, the row
 * pairs this link with a copy button for the text. Making the term deep-linkable
 * is a small change to `catalog-portal` (parse it in `CatalogPanel`, seed the
 * `q` state) and belongs in that package's own ticket.
 */
export function catalogSearchHref(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/#/`;
}
