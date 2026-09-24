import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  /** One append-only fact: this many units of this product were consumed on
   * this date. Deliberately not linked to a specific receipt line — that
   * link only means something inside this app, and which purchase a given
   * event depletes is a derived FIFO answer (see `src/lib/consumption.ts`),
   * not stored state. `token` is the connector's own account token, reused
   * verbatim as an opaque partition key; this deployment never verifies it
   * against the connector, the same way `catalog` never verifies anything
   * about its callers. */
  consumptionEvents: defineTable({
    token: v.string(),
    ean: v.string(),
    quantity: v.number(),
    consumedAt: v.number(),
  })
    .index('by_token', ['token'])
    .index('by_token_ean', ['token', 'ean']),

  /** A standing per-product choice, not a per-purchase one: excluding a
   * product should mean it never resurfaces, not that every future tube of
   * the same toothpaste needs excluding again. */
  productPreferences: defineTable({
    token: v.string(),
    ean: v.string(),
    excluded: v.boolean(),
  }).index('by_token_ean', ['token', 'ean']),
});
