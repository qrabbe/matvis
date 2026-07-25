import { z } from 'zod';
import { ReceiptSource } from './stores';

/**
 * Versioned contract for one clean catalog entry — the EAN-keyed, store-agnostic
 * row the catalog exposes. The raw per-chain product data behind it is NOT part
 * of this contract. Bumped when the shape changes in a breaking way.
 *
 * Versioning policy (identical to the receipt contract, see `receipt.ts`):
 *
 * - Adding a field, or making a required field optional, does NOT bump it.
 *   Consumers must ignore fields they do not know.
 * - Renaming, removing, or retyping a required field DOES bump it, and the API
 *   keeps serving the previous version until consumers migrate.
 * - As soon as a second version exists, add an `upcast(old): latest` here and
 *   have readers upcast on read.
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
