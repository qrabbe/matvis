/** The portal's own formatting helpers (no DOM). The receipt-level ones every
 * frontend shares live in @matvis/shared. */

/** Format an epoch-ms timestamp for display, or `null` if absent. */
export function formatDateTime(ms: number | null | undefined): string | null {
  return ms == null ? null : new Date(ms).toLocaleString();
}
