import { z } from 'zod';
import { ReceiptSource } from './stores';

/** The server throws above this rather than truncating, so both sides import
 * this one constant instead of copying it. */
export const MAX_EANS_PER_LOOKUP = 50;

/**
 * Canonical measurement units. One per dimension, and the single vocabulary
 * every quantity on a clean row is expressed in, so comparing two of them is
 * `===` rather than a lookup table.
 *
 * Deliberately not SI base units. Kilograms and cubic metres would state a
 * bottle as 0.0005, so each unit is the one that keeps grocery quantities whole
 * and matches the basis nutrition is published against.
 */
export const CATALOG_UNITS = [
  'g', // mass
  'ml', // volume
  'st', // countable pieces
  'mm', // length, for non-food goods sold by the metre
] as const;

export const CatalogUnit = z.enum(CATALOG_UNITS);
export type CatalogUnit = z.infer<typeof CatalogUnit>;

/**
 * A measured quantity in a canonical unit. Value and unit travel together so
 * neither can go missing without the other, which a pair of independently
 * optional fields cannot promise.
 */
export const CatalogQuantity = z
  .object({
    value: z.number().meta({ description: 'Amount, stated in `unit`.' }),
    unit: CatalogUnit.meta({
      description: 'One of "g", "ml", "st" or "mm".',
    }),
  })
  .meta({ id: 'CatalogQuantity' });
export type CatalogQuantity = z.infer<typeof CatalogQuantity>;

/** How a product is priced at the till. Canonical, not the store's own word. */
export const SOLD_BY = ['piece', 'weight'] as const;
export const SoldBy = z.enum(SOLD_BY);
export type SoldBy = z.infer<typeof SoldBy>;

/** Field notes are `.meta({ description })` and not JSDoc because the dev portal
 * renders them straight off `z.toJSONSchema`. */
export const CatalogNutrition = z
  .object({
    basisQuantity: z
      .number()
      .meta({ description: 'Amount the values are stated per, e.g. 100.' }),
    basisUnit: CatalogUnit.meta({
      description:
        'Unit the basis is measured in. The same vocabulary as CatalogItem.netContent, which is what makes scaling a package a comparison rather than a conversion. Only ever "g", "ml" or "st" in practice.',
    }),
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

/** Not an allergen source. Allergens are only ever prose inside `ingredients`,
 * so never present any part of this block as allergen coverage. */
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

export const CatalogItem = z.object({
  ean: z.string().meta({ description: 'GTIN/EAN, the cross-system join key.' }),
  name: z.string().meta({ description: 'Product display name.' }),
  store: ReceiptSource.meta({
    description: 'Store chain the entry was sourced from, e.g. "coop".',
  }),

  brand: z
    .string()
    .optional()
    .meta({ description: 'Manufacturer or brand name, e.g. "Santa Maria".' }),
  imageUrl: z.string().optional().meta({
    description:
      'Product image, normalized to an https URL a browser can render.',
  }),
  netContent: CatalogQuantity.optional().meta({
    description:
      'Net content in canonical units, resolved at ingest. This is the field to do arithmetic with. Scaling nutrition to a package is only valid when netContent.unit === food.nutrition.basisUnit; when they differ the product genuinely is not scalable and must not be approximated. Absent when the source stated no size, or a unit that did not resolve.',
  }),
  packageSizeText: z.string().optional().meta({
    description:
      'Package size as printed, e.g. "360g". Prefer this for display, and netContent for arithmetic.',
  }),
  soldBy: SoldBy.optional().meta({
    description:
      'Whether the till prices this per piece or per weight. "piece" or "weight".',
  }),
  categoryPath: z
    .array(z.string())
    .optional()
    .meta({ description: 'Category breadcrumb, root first and leaf last.' }),

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

  fetchedAt: z.number().optional().meta({
    description:
      'Unix ms when this row was last verified against the source. Absent means it has not been re-fetched since the field was introduced, not that it is fresh. Nothing runs on a schedule, so treat a distant value as exactly what it says.',
  }),
});
export type CatalogItem = z.infer<typeof CatalogItem>;
