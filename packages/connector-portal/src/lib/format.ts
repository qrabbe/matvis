/** Pure formatting/display helpers (no DOM). */

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Format a number as a receipt amount, e.g. "32.95 SEK". */
export function formatAmount(
  n: number | null | undefined,
  currency = 'SEK',
): string {
  if (n == null) return '—';
  return `${n.toFixed(2)} ${currency}`;
}

/** Format an ISO purchase timestamp for display, or `null` if absent. */
export function formatPurchasedAt(
  iso: string | null | undefined,
): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}
