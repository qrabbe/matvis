import { eachDay } from './dateRange';
import { dayKey } from './format';
import { addMacros, scaleMacros, ZERO_MACROS, type Macros } from './nutrition';
import type { PurchaseLine } from './purchases';

/** A logged fact: this many units of this product were consumed on this
 * date. Intentionally not linked to a specific purchase — which purchase(s)
 * it depletes is computed, not stored (see {@link allocateConsumption}). */
export interface ConsumptionEvent {
  ean: string;
  quantity: number;
  consumedAt: number;
}

/** The portion of one purchase line that a single consumption event
 * accounted for, and the window its macros are spread across. */
export interface ConsumedSpan {
  quantity: number;
  from: Date;
  to: Date;
  macros: Macros;
}

export interface LineAllocation {
  line: PurchaseLine;
  outstandingQuantity: number;
  outstandingMacros: Macros;
  spans: ConsumedSpan[];
}

const EPSILON = 1e-9;

/** FIFO-depletes each product's purchase lines, oldest first, against its
 * logged consumption events, oldest first. An event that consumes more than
 * was ever bought for that product (a missed receipt, a product bought
 * before the account started syncing) is simply left partially
 * unallocated — it cannot deplete stock that isn't in `lines`. */
export function allocateConsumption(
  lines: readonly PurchaseLine[],
  events: readonly ConsumptionEvent[],
): LineAllocation[] {
  const allocations = new Map<PurchaseLine, LineAllocation>();
  const linesByEan = new Map<string, PurchaseLine[]>();

  for (const line of lines) {
    allocations.set(line, {
      line,
      outstandingQuantity: line.item.quantity ?? 1,
      outstandingMacros: line.macros ?? ZERO_MACROS,
      spans: [],
    });
    const ean = line.product?.ean;
    if (!ean) continue;
    const group = linesByEan.get(ean);
    if (group) group.push(line);
    else linesByEan.set(ean, [line]);
  }

  const eventsByEan = new Map<string, ConsumptionEvent[]>();
  for (const event of events) {
    const group = eventsByEan.get(event.ean);
    if (group) group.push(event);
    else eventsByEan.set(event.ean, [event]);
  }

  for (const [ean, eanLines] of linesByEan) {
    const sortedLines = [...eanLines].sort(
      (a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime(),
    );
    const sortedEvents = [...(eventsByEan.get(ean) ?? [])].sort(
      (a, b) => a.consumedAt - b.consumedAt,
    );

    let cursor = 0;
    for (const event of sortedEvents) {
      let remaining = event.quantity;
      while (remaining > EPSILON && cursor < sortedLines.length) {
        const line = sortedLines[cursor]!;
        const alloc = allocations.get(line)!;
        if (alloc.outstandingQuantity <= EPSILON) {
          cursor++;
          continue;
        }

        const take = Math.min(remaining, alloc.outstandingQuantity);
        const lineQuantity = line.item.quantity ?? 1;
        const takenFraction = lineQuantity > 0 ? take / lineQuantity : 0;

        alloc.spans.push({
          quantity: take,
          from: line.purchasedAt,
          to: new Date(event.consumedAt),
          macros: line.macros
            ? scaleMacros(line.macros, takenFraction)
            : ZERO_MACROS,
        });
        alloc.outstandingQuantity -= take;
        alloc.outstandingMacros = line.macros
          ? scaleMacros(line.macros, alloc.outstandingQuantity / lineQuantity)
          : ZERO_MACROS;

        remaining -= take;
        if (alloc.outstandingQuantity <= EPSILON) cursor++;
      }
    }
  }

  return [...allocations.values()];
}

/** Spreads a span's macros evenly across every day from purchase to
 * consumption, inclusive — a bag of rice eaten two weeks after purchase
 * spreads over two weeks; something eaten same-day spreads over one day. */
export function spreadSpanByDay(
  span: ConsumedSpan,
): { day: string; macros: Macros }[] {
  const fromKey = dayKey(span.from);
  const toKey = dayKey(span.to);
  const range =
    fromKey <= toKey
      ? { from: fromKey, to: toKey }
      : { from: toKey, to: fromKey };
  const days = eachDay(range);
  if (days.length === 0) return [];
  const share = scaleMacros(span.macros, 1 / days.length);
  return days.map((day) => ({ day, macros: share }));
}

export function totalConsumedMacros(
  allocations: readonly LineAllocation[],
): Macros {
  let total = ZERO_MACROS;
  for (const alloc of allocations) {
    for (const span of alloc.spans) total = addMacros(total, span.macros);
  }
  return total;
}
