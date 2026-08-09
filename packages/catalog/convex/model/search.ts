export const SEARCH_TERM_MAX = 100;

export const VISITOR_MAX = 64;

export const SEARCH_LOG_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const SEARCH_LOG_TRIM = 10;

/** Rows the stats panel tallies.
 *
 * A `search_terms` rollup table upserted on every log and indexed by count
 * would answer "top terms all time" in a handful of reads, and is the obvious
 * thing to build. It also doubles the write path and adds a second table that
 * can disagree with the first. This is one bounded read the read-count tests
 * can assert, and it is honest as long as `oldestAt` is on screen beside it -
 * which is why `oldestAt` is in the return shape rather than decoration.
 *
 * Build the rollup when `oldestAt` starts reading as a few hours instead of
 * weeks. Not before. */
export const SEARCH_STATS_SAMPLE = 500;

export const SEARCH_TOP_TERMS = 20;

export const SEARCH_RECENT = 20;

/** The first 8 characters of a visitor id. The full one is noise on screen, and
 * the panel is for reading a pattern, not for following one person around. */
export const VISITOR_DISPLAY_CHARS = 8;

type Event = { term: string; visitor: string; results: number; at: number };

export type SearchStats = {
  sampled: number;
  visitors: number;
  zeroResults: number;
  oldestAt: number | null;
  top: { term: string; count: number; zeroResults: number; lastAt: number }[];
  recent: { term: string; at: number; visitor: string; results: number }[];
};

/** Tallies a newest-first page in memory. Pure, so the shape can be tested
 * without a database. */
export function tallySearchEvents(newestFirst: Event[]): SearchStats {
  const byTerm = new Map<
    string,
    { term: string; count: number; zeroResults: number; lastAt: number }
  >();
  const visitors = new Set<string>();
  let zeroResults = 0;

  for (const event of newestFirst) {
    visitors.add(event.visitor);
    if (event.results === 0) zeroResults += 1;

    const seen = byTerm.get(event.term);
    if (seen) {
      seen.count += 1;
      if (event.results === 0) seen.zeroResults += 1;
      seen.lastAt = Math.max(seen.lastAt, event.at);
    } else {
      byTerm.set(event.term, {
        term: event.term,
        count: 1,
        zeroResults: event.results === 0 ? 1 : 0,
        lastAt: event.at,
      });
    }
  }

  const oldest = newestFirst[newestFirst.length - 1];

  return {
    sampled: newestFirst.length,
    visitors: visitors.size,
    zeroResults,
    oldestAt: oldest ? oldest.at : null,
    top: [...byTerm.values()]
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, SEARCH_TOP_TERMS),
    recent: newestFirst.slice(0, SEARCH_RECENT).map((event) => ({
      term: event.term,
      at: event.at,
      visitor: event.visitor.slice(0, VISITOR_DISPLAY_CHARS),
      results: event.results,
    })),
  };
}

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
