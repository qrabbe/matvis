export const SEARCH_TERM_MAX = 100;

export const VISITOR_MAX = 64;

export const SEARCH_LOG_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const SEARCH_LOG_TRIM = 10;

/** The one stored form of a term. A separate display form buys nothing and
 * splits the tally across `Kaffe`, `kaffe ` and `KAFFE`. */
export function normalizeTerm(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, SEARCH_TERM_MAX);
}

/** Client supplied, so bounded. An empty visitor is stored as the empty string
 * rather than rejected: the row is still a real search. */
export function normalizeVisitor(raw: string): string {
  return raw.slice(0, VISITOR_MAX);
}

/** Telemetry, not billing. A hostile browser can lie about this and the
 * consequence is one wrong number in a console nobody bills off. */
export function normalizeResults(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(Math.floor(raw), 0);
}
