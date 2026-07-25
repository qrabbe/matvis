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

/**
 * Nutrition per {@link CatalogNutrition.basisQuantity} of the product. Fixed
 * slots rather than a free list: a store's own nutrient vocabulary is prose in
 * its own language, so the projector maps it onto these once and consumers
 * render a table without a lookup table of their own. Nutrients outside the
 * slots (vitamins, minerals) are dropped — they are on a small minority of rows
 * and adding a slot later is a compatible change.
 */
export const CatalogNutrition = z.object({
  /** Amount the values are stated per, e.g. 100. */
  basisQuantity: z.number(),
  /** Unit the basis is measured in: `"g"`, `"ml"` or `"st"` (pieces). */
  basisUnit: z.string(),
  energyKcal: z.number().optional(),
  energyKj: z.number().optional(),
  fatG: z.number().optional(),
  saturatedFatG: z.number().optional(),
  carbohydrateG: z.number().optional(),
  sugarsG: z.number().optional(),
  fiberG: z.number().optional(),
  proteinG: z.number().optional(),
  saltG: z.number().optional(),
});
export type CatalogNutrition = z.infer<typeof CatalogNutrition>;

/**
 * The consumable-product block. Present only when the source actually carries
 * ingredients or nutrition, so its presence IS the "this is food" signal — there
 * is deliberately no `kind` classifier, which would need a per-store category
 * mapping that is wrong at the edges. A consumer checks `item.food` once and
 * renders either the full card or the simple one.
 *
 * NOT an allergen source. Allergens are only ever prose inside
 * {@link CatalogFood.ingredients}; the structured allergen field the sources
 * offer is on too few rows to promise anything. Never present this block, or any
 * part of it, as allergen coverage.
 */
export const CatalogFood = z.object({
  /** Ingredient list as printed on the package, free prose. */
  ingredients: z.string().optional(),
  nutrition: CatalogNutrition.optional(),
});
export type CatalogFood = z.infer<typeof CatalogFood>;

/**
 * A single clean catalog item, keyed by GTIN/EAN across every store chain.
 *
 * Everything past the identity block is optional: coverage differs per field and
 * per chain, and a consumer must render around what is missing rather than
 * assume a full row. Price is deliberately absent — it is time-varying and
 * store-specific, so it belongs to its own contract, not to the product
 * description. Package size and sales unit stay, being product facts.
 */
export const CatalogItem = z.object({
  // ── Identity and provenance ──
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

  // ── Shelf card ──
  /** Manufacturer or brand name, e.g. "Santa Maria". */
  brand: z.string().optional(),
  /** Product image, normalized to an https URL a browser can render. */
  imageUrl: z.string().optional(),
  /** Numeric package size, e.g. 360. Pairs with {@link packageSizeUnit}. */
  packageSize: z.number().optional(),
  /** Unit of {@link packageSize}, verbatim from the source, e.g. "Gram". */
  packageSizeUnit: z.string().optional(),
  /** Package size as printed, e.g. "360g". Prefer this for display. */
  packageSizeText: z.string().optional(),
  /** How the product is sold, e.g. "Styck" or "Vikt". */
  salesUnit: z.string().optional(),
  /** Category breadcrumb, root first and leaf last. */
  categoryPath: z.array(z.string()).optional(),

  // ── Descriptive ──
  /** Marketing description, free prose. */
  description: z.string().optional(),
  /** Country of origin as a display name, e.g. "Sverige". */
  countryOfOrigin: z.string().optional(),
  /** Certification labels, e.g. "KRAV", "Nyckelhålet". Display names only. */
  labels: z.array(z.string()).optional(),

  /** Present only for consumable products. Absent entirely for a toothbrush. */
  food: CatalogFood.optional(),
});
export type CatalogItem = z.infer<typeof CatalogItem>;
