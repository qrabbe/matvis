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

/**
 * Human display names for each slug — proper brand capitalisation for the UI.
 * Keyed by {@link StoreSlug}, so adding a slug to {@link STORES} without a label
 * here is a type error. The canonical {@link STORES} order stays market-share
 * ordered; display ordering (e.g. live-first) is a concern for the caller.
 */
export const STORE_LABELS: Record<StoreSlug, string> = {
  ica: 'ICA',
  coop: 'Coop',
  willys: 'Willys',
  hemkop: 'Hemköp',
  lidl: 'Lidl',
  citygross: 'City Gross',
  tempo: 'Tempo',
  matoppet: 'Matöppet',
  handlarn: 'Handlarn',
  netto: 'Netto',
};

/** Which store/connector produced a receipt. Derived from {@link STORES}. */
export const ReceiptSource = z.enum(STORES);
export type ReceiptSource = z.infer<typeof ReceiptSource>;
