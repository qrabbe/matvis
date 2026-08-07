import { STORES, type CatalogItem } from '@matvis/shared';
import { v, type Infer } from 'convex/values';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Must stay a constraint on a concrete argument. The shorter
 * `AssertEqual<A extends B, B extends A>` is circular and passes on any drift. */
type Assert<T extends true> = T;

export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));

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

export const foodValidator = v.object({
  ingredients: v.optional(v.string()),
  nutrition: v.optional(nutritionValidator),
});

export const catalogFields = {
  ean: v.string(),
  name: v.string(),
  store: storeValidator,

  brand: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  packageSize: v.optional(v.number()),
  packageSizeUnit: v.optional(v.string()),
  packageSizeText: v.optional(v.string()),
  salesUnit: v.optional(v.string()),
  categoryPath: v.optional(v.array(v.string())),

  description: v.optional(v.string()),
  countryOfOrigin: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),

  food: v.optional(foodValidator),

  /** Optional because every row written before this field existed has no value
   * for it, and there is no honest one to backfill: `_creationTime` survives a
   * replace and so means first write, never last fetch. Absent reads as "not
   * verified since this landed", which is the truth. */
  fetchedAt: v.optional(v.number()),
} as const;

export const catalogDocValidator = v.object({
  _id: v.id('catalog'),
  _creationTime: v.number(),
  ...catalogFields,
});

/** Exported so `noUnusedLocals` cannot delete the pin: this is the compile-time
 * assertion that the table and `@matvis/shared`'s `CatalogItem` stay identical. */
export type CatalogItemMatches = Assert<
  Equal<Infer<ReturnType<typeof v.object<typeof catalogFields>>>, CatalogItem>
>;
