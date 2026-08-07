import type { CatalogItem, CatalogNutrition, StoreSlug } from '@matvis/shared';
import type { MutationCtx } from '../_generated/server';
import {
  bumpCounter,
  catalogStoreKey,
  CATALOG_COUNT_KEY,
  EANS_COUNT_KEY,
} from './counters';
import type { CoopProduct } from '../coop/sanitize';

export type CleanFields = CatalogItem;

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

const BASIS_UNIT_BY_CODE: Record<string, string> = {
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

export const projectCoop: Projector<CoopProduct> = (doc) => {
  if (!doc.ean || !doc.name) return null;

  const ingredients = text(doc.listOfIngredients);
  const nutrition = nutritionFromCoop(doc);

  return {
    ean: doc.ean,
    name: doc.name,

    brand: text(doc.manufacturerName),
    imageUrl: webImageUrl(doc.imageUrl),
    packageSize: doc.packageSize,
    packageSizeUnit: text(doc.packageSizeUnit),
    packageSizeText: text(doc.packageSizeInformation),
    salesUnit: text(doc.salesUnit),
    categoryPath: categoryPathFromCoop(doc),

    description: text(doc.description),
    countryOfOrigin: text(doc.countryOfOriginCodes?.[0]?.value),
    labels: labelsFromCoop(doc),

    food: ingredients || nutrition ? { ingredients, nutrition } : undefined,
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

/** Replaces rather than patches: a projection is a total function of one source
 * payload, so a value the source dropped must not linger on the clean row. */
export async function upsertClean(
  ctx: MutationCtx,
  fields: CleanFields,
): Promise<boolean> {
  const existing = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (q) =>
      q.eq('ean', fields.ean).eq('store', fields.store),
    )
    .first();
  if (existing) {
    await ctx.db.replace(existing._id, fields);
    return false;
  }
  await ctx.db.insert('catalog', fields);
  await bumpCounter(ctx, CATALOG_COUNT_KEY, 1);
  await bumpCounter(ctx, catalogStoreKey(fields.store), 1);
  return true;
}

/** Records a barcode as one we have heard of. Called for every EAN that enters
 * the pipeline, hit or miss, so the sweep has a durable worklist. */
export async function rememberEan(
  ctx: MutationCtx,
  store: StoreSlug,
  ean: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query('eans')
    .withIndex('by_store_ean', (q) => q.eq('store', store).eq('ean', ean))
    .first();
  if (existing) return false;
  await ctx.db.insert('eans', { ean, store, addedAt: Date.now() });
  await bumpCounter(ctx, EANS_COUNT_KEY, 1);
  return true;
}
