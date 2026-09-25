export function formatKr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

/** Local time, deliberately not `toISOString()`, which shifts to UTC and files
 * an evening purchase under the next day. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Must not become `new Date(key)`, which reads `YYYY-MM-DD` as UTC. */
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

export function formatDayShort(key: string): string {
  const date = parseDayKey(key);
  if (!date) return key;
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export function formatGrams(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)} g`;
}

export function formatKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kcal`;
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

/** ISO-8601 week number label ("Week 39") — used only to bucket the
 * receipts list, never to compute anything numeric, so ISO's Thursday-
 * anchored edge cases don't matter here. */
export function isoWeekLabel(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `Week ${week}`;
}
