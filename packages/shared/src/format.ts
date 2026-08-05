export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function formatAmount(
  n: number | null | undefined,
  currency = 'SEK',
): string {
  if (n == null) return '—';
  return `${n.toFixed(2)} ${currency}`;
}

export function formatPurchasedAt(
  iso: string | null | undefined,
): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

export function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}
