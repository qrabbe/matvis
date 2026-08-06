export function formatDateTime(ms: number | null | undefined): string | null {
  return ms == null ? null : new Date(ms).toLocaleString();
}
