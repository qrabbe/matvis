import { z } from 'zod';

/**
 * Canonical list of store slugs the connectors target. This is the single
 * source of truth: the zod {@link ReceiptSource} enum and the connector's
 * Convex `store` validator both derive from this array, so the two can never
 * drift out of sync.
 *
 * Ordered roughly by Swedish grocery market share. Only the first few have a
 * built connector today; the rest are reserved slugs so adding a connector is a
 * code change here, not a schema migration.
 */
export const STORES = [
  'ica',
  'coop',
  'willys', // Axfood
  'hemkop', // Axfood
  'lidl',
  'citygross', // Bergendahls
  'tempo', // Axfood
  'matoppet',
  'handlarn',
  'netto',
] as const;

/** A supported store slug, e.g. `'coop'`. (The receipt's store object is `Store`.) */
export type StoreSlug = (typeof STORES)[number];

/** Which store/connector produced a receipt. Derived from {@link STORES}. */
export const ReceiptSource = z.enum(STORES);
export type ReceiptSource = z.infer<typeof ReceiptSource>;
