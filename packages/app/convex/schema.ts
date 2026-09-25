import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  /** One pantry unit finished or thrown away, on a date. A unit is a single
   * package (or weighed lot) from one receipt line — `receiptId` + `lineNo`
   * + `unitIndex` is its whole identity, deliberately not the product's
   * EAN, so a mark survives the line being re-matched to a different
   * product later and a re-parse that only enriches quantity/unit (see
   * `packages/connector`'s parser) never orphans it. `token` is the
   * connector's own account token, reused verbatim as an opaque partition
   * key; this deployment never verifies it against the connector, the same
   * way `catalog` never verifies anything about its callers.
   *
   * Nothing here is precomputed: which unit is "oldest" and due next, a
   * product's typical duration, and the forecast are all derived at read
   * time in `src/lib` from these rows plus the connector's receipt lines —
   * see `pantryUnits.ts` and `durations.ts`. This table is the only source
   * of truth for what actually happened. */
  marks: defineTable({
    token: v.string(),
    receiptId: v.string(),
    lineNo: v.number(),
    unitIndex: v.number(),
    outcome: v.union(v.literal('finished'), v.literal('wasted')),
    finishedAt: v.number(), // epoch ms
    /** True when the person actively chose this date rather than accepting
     * the prefilled default. A single tap always counts as teaching a
     * product's typical duration; a bulk "Mark all" only does when this is
     * true — otherwise catching up a forgotten trip would teach bread that
     * it lasts however long it sat unmarked. See `durations.ts`. */
    finishedAtHandSet: v.boolean(),
    /** Defaults to the unit's purchase date, or the previous unit of the
     * same product's finish date, whichever a fresh mark would compute —
     * stored only once the person opens the toast's "Started" chip and
     * sets something else. */
    startedAt: v.optional(v.number()),
    via: v.union(v.literal('tap'), v.literal('trip'), v.literal('details')),
  })
    .index('by_token', ['token'])
    .index('by_token_unit', ['token', 'receiptId', 'lineNo', 'unitIndex']),
});
