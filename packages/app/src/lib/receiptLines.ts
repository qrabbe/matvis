import type { PurchaseLine } from './purchases';

export interface FoldedLine {
  line: PurchaseLine;
  /** The line's own price, plus any discount line(s) immediately
   * following it in `lineNo` order — the net amount actually charged. */
  netPrice: number;
}

/** Non-food lines never reach here (callers filter `kind === 'notFood'`
 * out first — this only folds discounts). A discount is attributed to
 * whichever non-discount line most recently preceded it in `lineNo`
 * order, matching how Coop prints a discount directly under the item it
 * reduces; a discount with nothing before it (shouldn't happen on a real
 * receipt) is dropped rather than guessed at. */
export function foldDiscounts(lines: readonly PurchaseLine[]): FoldedLine[] {
  const sorted = [...lines].sort((a, b) => a.item.lineNo - b.item.lineNo);
  const folded: FoldedLine[] = [];

  for (const line of sorted) {
    if (line.item.isDiscount) {
      const previous = folded[folded.length - 1];
      if (previous) previous.netPrice += line.item.price;
      continue;
    }
    folded.push({ line, netPrice: line.item.price });
  }

  return folded;
}
