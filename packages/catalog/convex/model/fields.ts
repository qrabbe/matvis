import { STORES, type CatalogItem } from '@matvis/shared';
import { v, type Infer } from 'convex/values';

/** True when `A` and `B` are mutually assignable. The tuple wrappers stop the
 * conditional from distributing over union members. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compile-time guard: `Assert<Equal<A, B>>` fails the build unless the two
 * match. Spelling it as a constraint on a concrete argument matters, because the
 * shorter `AssertEqual<A extends B, B extends A>` is a circular constraint that
 * TypeScript reports and then ignores, so it passes on any drift. */
type Assert<T extends true> = T;

/** Store slug validator, derived from the canonical STORES list in
 * @matvis/shared so the column can never accept a slug the contract rejects. */
export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));

/** Nutrition per `basisQuantity` `basisUnit` of the product. Fixed slots; see
 * `CatalogNutrition` in @matvis/shared for why. */
export const nutritionValidator = v.object({
  basisQuantity: v.number(),
  basisUnit: v.string(),
  energyKcal: v.optional(v.number()),
  energyKj: v.optional(v.number()),
  fatG: v.optional(v.number()),
  saturatedFatG: v.optional(v.number()),
  carbohydrateG: v.optional(v.number()),
  sugarsG: v.optional(v.number()),
  fiberG: v.optional(v.number()),
  proteinG: v.optional(v.number()),
  saltG: v.optional(v.number()),
});

/** The consumable-product block. Its presence is the "this is food" signal. Not
 * an allergen source — allergens only ever appear as prose in `ingredients`. */
export const foodValidator = v.object({
  ingredients: v.optional(v.string()),
  nutrition: v.optional(nutritionValidator),
});

/**
 * The columns of a clean `catalog` row (no system fields). Single source spread
 * into the schema, the ingest validators and the read API's return validator, so
 * the four can't drift apart. The contract itself lives in @matvis/shared; the
 * guard below fails the build if this stops mirroring it.
 */
export const catalogFields = {
  // Identity and provenance.
  ean: v.string(),
  name: v.string(),
  store: storeValidator,
  sourceTable: v.string(),
  sourceId: v.string(),

  // Shelf card.
  brand: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  packageSize: v.optional(v.number()),
  packageSizeUnit: v.optional(v.string()),
  packageSizeText: v.optional(v.string()),
  salesUnit: v.optional(v.string()),
  categoryPath: v.optional(v.array(v.string())),

  // Descriptive.
  description: v.optional(v.string()),
  countryOfOrigin: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),

  // Present only for consumable products.
  food: v.optional(foodValidator),
} as const;

/** A clean `catalog` row as stored, with its Convex system fields. */
export const catalogDocValidator = v.object({
  _id: v.id('catalog'),
  _creationTime: v.number(),
  ...catalogFields,
});

// Fails the build if the stored shape drifts from the shared zod contract
// (type-only, erased at runtime).
type _CatalogItemMatches = Assert<
  Equal<Infer<ReturnType<typeof v.object<typeof catalogFields>>>, CatalogItem>
>;
