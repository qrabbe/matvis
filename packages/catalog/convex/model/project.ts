import type {
  CatalogItem,
  CatalogNutrition,
  CatalogQuantity,
  CatalogUnit,
  SoldBy,
  StoreSlug,
} from '@matvis/shared';
import type { MutationCtx } from '../_generated/server';
import {
  bumpCounter,
  catalogStoreKey,
  CATALOG_COUNT_KEY,
  CATALOG_VERIFIED_KEY,
  EANS_COUNT_KEY,
} from './counters';
import type { CoopProduct } from '../coop/sanitize';
import { netContentFromName, type IcaProduct } from '../ica/parse';

/** What a projector produces. `fetchedAt` is excluded because a projection is a
 * pure function of a payload and the time it arrived is not in the payload:
 * `upsertClean` stamps it at the write, which is the one place that knows. */
export type CleanFields = Omit<CatalogItem, 'fetchedAt'>;

export type ProjectedFields = Omit<CleanFields, 'store'>;

export type Projector<Raw> = (doc: Raw) => ProjectedFields | null;

type NutrientSlot = Exclude<
  keyof CatalogNutrition,
  'basisQuantity' | 'basisUnit'
>;

/** Energi is absent on purpose: it appears twice per product and is resolved
 * by unit in ENERGY_SLOT_BY_UNIT instead. */
const SLOT_BY_DESCRIPTION: Record<string, NutrientSlot> = {
  fett: 'fatG',
  'varav mättat fett': 'saturatedFatG',
  kolhydrat: 'carbohydrateG',
  'varav sockerarter': 'sugarsG',
  fiber: 'fiberG',
  protein: 'proteinG',
  salt: 'saltG',
};

const ENERGY_SLOT_BY_UNIT: Record<string, NutrientSlot> = {
  kilokalori: 'energyKcal',
  kilojoule: 'energyKj',
};

const BASIS_UNIT_BY_CODE: Record<string, CatalogUnit> = {
  GRM: 'g',
  MLT: 'ml',
  H87: 'st',
};

export function parseNutrientAmount(
  amount: string | string[] | undefined,
): number | undefined {
  const raw = Array.isArray(amount) ? amount[0] : amount;
  if (typeof raw !== 'string') return undefined;
  const match = /-?\d+(?:[.,]\d+)?/.exec(raw);
  if (!match) return undefined;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

export function nutritionFromCoop(
  doc: CoopProduct,
): CatalogNutrition | undefined {
  const links = doc.nutrientLinks ?? [];
  if (links.length === 0) return undefined;

  const header = doc.nutrientInformation?.find((entry) => entry.header)?.header;
  const basisQuantity =
    doc.nutrientBasis?.quantity ?? header?.nutrientBasisQuantity;
  if (basisQuantity === undefined) return undefined;

  const unitCode = header?.nutrientBasisQuantityUnit?.code;
  const nutrition: CatalogNutrition = {
    basisQuantity,
    basisUnit: (unitCode && BASIS_UNIT_BY_CODE[unitCode]) || 'g',
  };

  for (const link of links) {
    const description = link.description.trim().toLowerCase();
    const unit = link.unit?.trim().toLowerCase();
    const slot =
      description === 'energi'
        ? unit && ENERGY_SLOT_BY_UNIT[unit]
        : SLOT_BY_DESCRIPTION[description];
    if (!slot) continue;
    const amount = parseNutrientAmount(link.amount);
    if (amount !== undefined && nutrition[slot] === undefined) {
      nutrition[slot] = amount;
    }
  }
  return nutrition;
}

type NavNode = { name: string; superCategories?: unknown };

function isNavNode(value: unknown): value is NavNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NavNode).name === 'string'
  );
}

/** `navCategories[0]` is the LEAF and `superCategories` nests upward, so this
 * walks in reverse. */
export function categoryPathFromCoop(doc: CoopProduct): string[] | undefined {
  const path: string[] = [];
  let node: unknown = doc.navCategories?.[0];
  while (isNavNode(node) && path.length < 8) {
    path.push(node.name);
    node = Array.isArray(node.superCategories)
      ? node.superCategories[0]
      : undefined;
  }
  return path.length > 0 ? path.reverse() : undefined;
}

export function labelsFromCoop(doc: CoopProduct): string[] | undefined {
  const names = (doc.accreditedTags ?? []).flatMap((tag) => {
    const description = tag.description?.trim();
    return description ? [description] : [];
  });
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique : undefined;
}

/** The `f_auto,q_auto` insert is what stops the CDN serving the multi-megabyte
 * TIFF original, which no browser renders. */
export function webImageUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const https = trimmed.replace(/^http:\/\//i, 'https://');
  return https.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/i,
    '$1f_auto,q_auto/',
  );
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Coop's `packageSizeUnit` vocabulary as a canonical unit and a multiplier into
 * it. Three naming systems are interleaved in that one column: display names
 * (`Gram`), abbreviations (`gr`, `cl`, `l`) and raw UN/ECE codes (`GRM`, `MLT`,
 * `H87`) - the same code family `BASIS_UNIT_BY_CODE` maps for the nutrition
 * basis. Keyed lowercased and trimmed, which collapses `st`/`ST`/`Styck`
 * without separate entries.
 *
 * Every key here was measured across the whole table rather than a sample.
 * `MMT`, `Liter`, `MTR` and `KGM` appear once or twice each and are absent from
 * the first 3000 rows, so a table built from a sample would have dropped them
 * silently. */
const UNIT_BY_SOURCE: Record<string, { unit: CatalogUnit; factor: number }> = {
  gram: { unit: 'g', factor: 1 },
  'gram ungefärlig vikt': { unit: 'g', factor: 1 },
  'gram/st ungefärlig vikt': { unit: 'g', factor: 1 },
  'gram/bit ungefärlig vikt': { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  grm: { unit: 'g', factor: 1 },
  kilogram: { unit: 'g', factor: 1000 },
  kg: { unit: 'g', factor: 1000 },
  kgm: { unit: 'g', factor: 1000 },

  milliliter: { unit: 'ml', factor: 1 },
  ml: { unit: 'ml', factor: 1 },
  mlt: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
  ltr: { unit: 'ml', factor: 1000 },

  styck: { unit: 'st', factor: 1 },
  st: { unit: 'st', factor: 1 },
  h87: { unit: 'st', factor: 1 },

  millimeter: { unit: 'mm', factor: 1 },
  mmt: { unit: 'mm', factor: 1 },
  meter: { unit: 'mm', factor: 1000 },
  mtr: { unit: 'mm', factor: 1000 },

  // Deliberately absent: `kvadratmeter`, which one row states. It is an area
  // and CATALOG_UNITS carries no area unit, so the honest answer is no
  // netContent rather than a number filed under a length.
};

const SOLD_BY_SOURCE: Record<string, SoldBy> = {
  styck: 'piece',
  vikt: 'weight',
};

/** Lenient like its neighbours: an unresolvable unit or a missing size answers
 * `undefined` and never throws, so one odd product cannot fail a whole batch.
 * Absent is the honest answer, because a consumer skipping the item beats one
 * dividing by a guess. */
export function netContentFrom(
  size: number | undefined,
  sourceUnit: string | undefined,
): CatalogQuantity | undefined {
  if (typeof size !== 'number' || !Number.isFinite(size)) return undefined;
  const key = sourceUnit?.trim().toLowerCase();
  const resolved = key ? UNIT_BY_SOURCE[key] : undefined;
  if (!resolved) return undefined;
  return { value: size * resolved.factor, unit: resolved.unit };
}

export function soldByFrom(sourceUnit: string | undefined): SoldBy | undefined {
  const key = sourceUnit?.trim().toLowerCase();
  return key ? SOLD_BY_SOURCE[key] : undefined;
}

export const projectCoop: Projector<CoopProduct> = (doc) => {
  if (!doc.ean || !doc.name) return null;

  const ingredients = text(doc.listOfIngredients);
  const nutrition = nutritionFromCoop(doc);

  return {
    ean: doc.ean,
    name: doc.name,

    brand: text(doc.manufacturerName),
    imageUrl: webImageUrl(doc.imageUrl),
    netContent: netContentFrom(doc.packageSize, doc.packageSizeUnit),
    packageSizeText: text(doc.packageSizeInformation),
    soldBy: soldByFrom(doc.salesUnit),
    categoryPath: categoryPathFromCoop(doc),

    description: text(doc.description),
    countryOfOrigin: text(doc.countryOfOriginCodes?.[0]?.value),
    labels: labelsFromCoop(doc),

    food: ingredients || nutrition ? { ingredients, nutrition } : undefined,
  };
};

/** ICA's page yields most of the contract directly, so this is mostly a
 * rename. Three fields are absent rather than derived, and each for a reason
 * worth keeping written down:
 *
 * `netContent` is read out of the product name because ICA publishes no size
 * field on the public page. It is on the store scoped ecommerce API as
 * `packSizeDescription`, along with `countryOfOrigin` and `labels`, but that
 * API answers five calls before a WAF challenge locks it out for minutes, so it
 * cannot carry a 34 437 product load. See `netContentFromName`.
 *
 * `soldBy` is left absent rather than guessed at `piece`. ICA states it
 * nowhere, and a wrong `weight`/`piece` on a loose item is worse than none.
 *
 * `imageUrl` needs no rewriting. ICA already serves a sized webp, which is the
 * whole of what `webImageUrl` exists to do for Coop's TIFF originals. */
export const projectIca: Projector<IcaProduct> = (doc) => {
  if (!doc.ean || !doc.name) return null;

  return {
    ean: doc.ean,
    name: doc.name,

    brand: text(doc.brand),
    imageUrl: text(doc.imageUrl),
    netContent: netContentFromName(doc.name),
    packageSizeText: undefined,
    soldBy: undefined,
    categoryPath: doc.categoryPath,

    description: text(doc.description),
    countryOfOrigin: undefined,
    labels: undefined,

    food:
      doc.ingredients || doc.nutrition
        ? { ingredients: doc.ingredients, nutrition: doc.nutrition }
        : undefined,
  };
};

export function project(
  store: StoreSlug,
  doc: CoopProduct,
): CleanFields | null {
  const projected = projectCoop(doc);
  if (!projected) return null;
  return { ...projected, store };
}

/** The ICA half of `project`. Separate rather than an overload because the two
 * take unrelated payloads and share nothing but the return type. */
export function projectIcaProduct(doc: IcaProduct): CleanFields | null {
  const projected = projectIca(doc);
  if (!projected) return null;
  return { ...projected, store: 'ica' };
}

/** Replaces rather than patches: a projection is a total function of one source
 * payload, so a value the source dropped must not linger on the clean row.
 *
 * Stamps `fetchedAt` here because this is the only place that both knows the
 * row came from the source and survives the replace. Anything that rewrites a
 * row without re-reading the source must carry the old stamp forward instead of
 * calling this, or it claims a freshness it did not earn. */
export async function upsertClean(
  ctx: MutationCtx,
  fields: CleanFields,
  fetchedAt: number = Date.now(),
): Promise<boolean> {
  const existing = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (q) =>
      q.eq('ean', fields.ean).eq('store', fields.store),
    )
    .first();
  if (existing) {
    // A row verified for the first time crosses from never-fetched to fetched,
    // and that is the only moment the verified count can move on a replace.
    if (existing.fetchedAt === undefined) {
      await bumpCounter(ctx, CATALOG_VERIFIED_KEY, 1);
    }
    await ctx.db.replace(existing._id, { ...fields, fetchedAt });
    return false;
  }
  await ctx.db.insert('catalog', { ...fields, fetchedAt });
  await bumpCounter(ctx, CATALOG_COUNT_KEY, 1);
  await bumpCounter(ctx, catalogStoreKey(fields.store), 1);
  await bumpCounter(ctx, CATALOG_VERIFIED_KEY, 1);
  return true;
}

/** Records a barcode as one we have heard of. Called for every EAN that enters
 * the pipeline, hit or miss, so the sweep has a durable worklist.
 *
 * A `sourceId` is filled in on a row that lacks one rather than only on insert.
 * The Coop census reached many of these barcodes first and recorded no id, and
 * the ICA load is what supplies it, so an already known EAN is exactly the case
 * that needs the update. */
export async function rememberEan(
  ctx: MutationCtx,
  store: StoreSlug,
  ean: string,
  sourceId?: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query('eans')
    .withIndex('by_store_ean', (q) => q.eq('store', store).eq('ean', ean))
    .first();
  if (existing) {
    if (sourceId !== undefined && existing.sourceId !== sourceId) {
      await ctx.db.patch(existing._id, { sourceId });
    }
    return false;
  }
  await ctx.db.insert('eans', { ean, store, addedAt: Date.now(), sourceId });
  await bumpCounter(ctx, EANS_COUNT_KEY, 1);
  return true;
}
