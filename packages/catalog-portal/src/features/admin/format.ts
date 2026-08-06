export function formatCount(value: number): string {
  return value.toLocaleString();
}

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

export function formatSummary(
  summary: Record<string, number> | undefined,
): string {
  if (!summary) return '';
  return Object.entries(summary)
    .map(([key, value]) => `${key} ${value.toLocaleString()}`)
    .join(', ');
}

export function formatDuration(startedAt: number, finishedAt?: number): string {
  const ms = (finishedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)} min`;
}
