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

/** Format an epoch-ms timestamp for display, or `null` if absent. */
export function formatDateTime(ms: number | null | undefined): string | null {
  return ms == null ? null : new Date(ms).toLocaleString();
}

/**
 * Money for a dashboard tile: whole kronor, thousands-separated, e.g.
 * "12 480 kr". Tiles are scanned rather than reconciled, so the ören are noise.
 * Anything that has to add up (a receipt line, a total) uses
 * {@link formatAmount} instead.
 */
export function formatKr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

/** A `YYYY-MM-DD` day key in LOCAL time. Deliberately not `toISOString()`,
 * which shifts to UTC and files an evening purchase under the next day. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` day key back to local midnight, or `null` if malformed. */
export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Short day label for an axis or a tooltip, e.g. "14 mars". */
export function formatDayShort(key: string): string {
  const date = parseDayKey(key);
  if (!date) return key;
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

/** A macro amount, rounded to whole grams, e.g. "142 g". */
export function formatGrams(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)} g`;
}

/** An energy amount, e.g. "1 940 kcal". */
export function formatKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kcal`;
}

/** A ratio as a whole percent, e.g. (142, 1504) → "9%". Guards a zero
 * denominator, which is the normal state of a fresh account, not an error. */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}
