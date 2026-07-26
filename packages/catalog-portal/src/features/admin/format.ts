/** Formatting shared by the console's panels. */

/** A count as a stat reads it. Exact: the backend maintains these as counters
 * rather than capping a scan, so there is no "1000+" case left to render. */
export function formatCount(value: number): string {
  return value.toLocaleString();
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
