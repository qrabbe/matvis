import { v } from 'convex/values';
import { mutation } from './_generated/server';
import {
  SEARCH_LOG_TRIM,
  SEARCH_LOG_TTL_MS,
  normalizeResults,
  normalizeTerm,
  normalizeVisitor,
} from './model/search';

/** Deliberately not in `catalog.ts`. That module is the published contract:
 * `tools/catalog-api-spec.ts` walks exactly it, `bun run spec:check` gates it in
 * CI, and the dev portal renders every public function it finds there with a
 * live Try it button. Every function in it is a read. A public write in that
 * module would be a documented, one-click-runnable endpoint that inserts rows.
 *
 * Returns `null` in every case, including the ignored ones. The endpoint is
 * unauthenticated and tells a caller nothing about what it did with the input. */
export const logSearch = mutation({
  args: { term: v.string(), visitor: v.string(), results: v.number() },
  returns: v.null(),
  handler: async (ctx, { term, visitor, results }) => {
    const normalized = normalizeTerm(term);
    // Browsing with an empty box is not a search.
    if (normalized === '') return null;

    // Bounded work per write, no cron and no sweep. Worth stating that this
    // only trims while searches happen: a log nobody is writing to stops
    // growing anyway, so there is nothing left to collect.
    const oldest = await ctx.db
      .query('search_events')
      .order('asc')
      .take(SEARCH_LOG_TRIM);
    const cutoff = Date.now() - SEARCH_LOG_TTL_MS;
    for (const row of oldest) {
      if (row._creationTime < cutoff) await ctx.db.delete(row._id);
    }

    await ctx.db.insert('search_events', {
      term: normalized,
      visitor: normalizeVisitor(visitor),
      results: normalizeResults(results),
    });
    return null;
  },
});
