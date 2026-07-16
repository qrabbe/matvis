import { z } from 'zod';
import { ReceiptSource } from './stores';

/**
 * Versioned contract for one clean catalog entry — the EAN-keyed, store-agnostic
 * row the catalog exposes. The raw per-chain product data behind it is NOT part
 * of this contract. Bumped when the shape changes in a breaking way.
 */
export const CATALOG_SCHEMA_VERSION = 1;

/** A single clean catalog item, keyed by GTIN/EAN across every store chain. */
export const CatalogItem = z.object({
  /** GTIN/EAN, the cross-system join key. */
  ean: z.string(),
  /** Product display name. */
  name: z.string(),
  /** Which store chain this entry was sourced from. */
  store: ReceiptSource,
  /** Raw table the clean row was projected from, e.g. "raw_coop". */
  sourceTable: z.string(),
  /** Id of the backing raw row, as a string (references any `raw_*` table). */
  sourceId: z.string(),
});
export type CatalogItem = z.infer<typeof CatalogItem>;
