import { z } from 'zod';
import { ReceiptSource } from './stores';

/**
 * Most EANs a single `getManyByEan` call may ask for. A receipt is ~20 lines, so
 * this is still generous; the cap exists so one call can't turn into an
 * unbounded fan-out of index reads. A caller with more splits into two calls.
 *
 * Contract rather than implementation: the server throws above it rather than
 * truncating, so a client that batches by a stale copy fails at runtime with
 * nothing failing at build time. Both sides import this one.
 */
export const MAX_EANS_PER_LOOKUP = 50;

/**
 * Nutrition per {@link CatalogNutrition.basisQuantity} of the product. Fixed
 * slots rather than a free list: a store's own nutrient vocabulary is prose in
 * its own language, so the projector maps it onto these once and consumers
 * render a table without a lookup table of their own. Nutrients outside the
 * slots (vitamins, minerals) are dropped — they are on a small minority of rows
 * and adding a slot later is a compatible change.
 *
 * The per-field notes are `.meta({ description })` rather than JSDoc so the dev
 * portal can render them straight off `z.toJSONSchema`, and the `id` puts this
 * in `$defs` under its own name instead of being inlined into every parent.
 */
export const CatalogNutrition = z
  .object({
    basisQuantity: z
      .number()
      .meta({ description: 'Amount the values are stated per, e.g. 100.' }),
    basisUnit: z.string().meta({ description: '"g", "ml" or "st" (pieces).' }),
    energyKcal: z
      .number()
      .optional()
      .meta({ description: 'Energy in kilocalories.' }),
    energyKj: z.number().optional().meta({
      description: 'Energy in kilojoules, when the source states it.',
    }),
    fatG: z.number().optional().meta({ description: 'Fat, in grams.' }),
    saturatedFatG: z
      .number()
      .optional()
      .meta({ description: 'Of which saturated, in grams.' }),
    carbohydrateG: z
      .number()
      .optional()
      .meta({ description: 'Carbohydrate, in grams.' }),
    sugarsG: z
      .number()
      .optional()
      .meta({ description: 'Of which sugars, in grams.' }),
    fiberG: z.number().optional().meta({ description: 'Fibre, in grams.' }),
    proteinG: z.number().optional().meta({ description: 'Protein, in grams.' }),
    saltG: z.number().optional().meta({ description: 'Salt, in grams.' }),
  })
  .meta({ id: 'CatalogNutrition' });
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
export const CatalogFood = z
  .object({
    ingredients: z.string().optional().meta({
      description: 'Ingredient list as printed on the package, free prose.',
    }),
    nutrition: CatalogNutrition.optional().meta({
      description: 'Fixed nutrient slots, stated per basisQuantity basisUnit.',
    }),
  })
  .meta({ id: 'CatalogFood' });
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
  ean: z.string().meta({ description: 'GTIN/EAN, the cross-system join key.' }),
  name: z.string().meta({ description: 'Product display name.' }),
  store: ReceiptSource.meta({
    description: 'Store chain the entry was sourced from, e.g. "coop".',
  }),
  sourceTable: z.string().meta({
    description:
      'Raw table the clean row was projected from, e.g. "raw_coop". A provenance breadcrumb to quote in a bug report, not a handle: no public function accepts it.',
  }),
  sourceId: z.string().meta({
    description:
      'Id of the backing raw row, as a string. Provenance only, like sourceTable, and not dereferenceable.',
  }),

  // ── Shelf card ──
  brand: z
    .string()
    .optional()
    .meta({ description: 'Manufacturer or brand name, e.g. "Santa Maria".' }),
  imageUrl: z.string().optional().meta({
    description:
      'Product image, normalized to an https URL a browser can render.',
  }),
  packageSize: z.number().optional().meta({
    description: 'Numeric package size, e.g. 360. Pairs with packageSizeUnit.',
  }),
  packageSizeUnit: z.string().optional().meta({
    description: 'Unit of packageSize, verbatim from the source, e.g. "Gram".',
  }),
  packageSizeText: z.string().optional().meta({
    description:
      'Package size as printed, e.g. "360g". Prefer this for display.',
  }),
  salesUnit: z
    .string()
    .optional()
    .meta({ description: 'How the product is sold, e.g. "Styck" or "Vikt".' }),
  categoryPath: z
    .array(z.string())
    .optional()
    .meta({ description: 'Category breadcrumb, root first and leaf last.' }),

  // ── Descriptive ──
  description: z
    .string()
    .optional()
    .meta({ description: 'Marketing description, free prose.' }),
  countryOfOrigin: z.string().optional().meta({
    description: 'Country of origin as a display name, e.g. "Sverige".',
  }),
  labels: z.array(z.string()).optional().meta({
    description:
      'Certification labels, e.g. "KRAV", "Nyckelhålet". Display names only.',
  }),

  food: CatalogFood.optional().meta({
    description:
      'Present only for consumable products, absent entirely for a toothbrush. Its presence IS the "this is food" signal; there is no kind classifier.',
  }),
});
export type CatalogItem = z.infer<typeof CatalogItem>;
