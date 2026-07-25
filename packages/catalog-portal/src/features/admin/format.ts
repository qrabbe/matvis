/** Formatting shared by the console's panels. */

/** A capped count as the backend means it: 1000 with `capped` set is "1000+",
 * because the query stopped counting rather than found exactly a thousand. */
export function formatCount(value: number, capped: boolean): string {
  const text = value.toLocaleString();
  return capped ? `${text}+` : text;
}

/** A timestamp as a rough age, e.g. "4 min ago". Null reads as never. */
export function formatAge(at: number | null | undefined): string {
  if (at === null || at === undefined) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** A run's summary object as one line, e.g. "claimed 500, added 487". Ingest
 * actions all return a flat bag of counts, which is what makes this general. */
export function formatSummary(
  summary: Record<string, number> | undefined,
): string {
  if (!summary) return '';
  return Object.entries(summary)
    .map(([key, value]) => `${key} ${value.toLocaleString()}`)
    .join(', ');
}

/** How long a run took, or how long it has been going. */
export function formatDuration(startedAt: number, finishedAt?: number): string {
  const ms = (finishedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)} min`;
}
