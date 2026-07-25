import type { CatalogItem, CatalogNutrition, StoreSlug } from '@matvis/shared';
import type { MutationCtx } from '../_generated/server';
import type { DataModel, Doc } from '../_generated/dataModel';
import { bumpCounter, CATALOG_COUNT_KEY } from './counters';

/** Fields a clean `catalog` row carries (minus system fields). The shared
 * contract IS the row shape, so widening the contract widens this. */
export type CleanFields = CatalogItem;

/**
 * The part of a clean row a projector produces. Provenance (`store`,
 * `sourceTable`, `sourceId`) comes from the registry entry and the raw row id,
 * so a projector never has to repeat it.
 */
export type ProjectedFields = Omit<
  CleanFields,
  'store' | 'sourceTable' | 'sourceId'
>;

/**
 * Pure, synchronous projection of one raw row into clean fields, run on ingest.
 * Returns null to skip the row. A projector only reshapes fields already present
 * on its own raw row. Anything needing I/O or cross-row reconciliation belongs in
 * a later async enrichment pass, not here.
 */
export type Projector<Raw> = (doc: Raw) => ProjectedFields | null;

/** Raw tables that feed the clean catalog. One projector per table. */
export type SourceTable = Extract<keyof DataModel, `raw_${string}`>;

// ── Coop field transforms ────────────────────────────────────────────────────
// Exported for their unit tests. Every one of them is lenient by design: the raw
// rows are a third party's export, so anything unreadable is dropped rather than
// thrown on. A single odd product must never fail a whole ingest batch.

/** A nutrition slot on the clean contract, i.e. everything but the basis. */
type NutrientSlot = Exclude<
  keyof CatalogNutrition,
  'basisQuantity' | 'basisUnit'
>;

/**
 * Coop's `nutrientLinks[].description` vocabulary, mapped onto the fixed slots.
 * Stable Swedish free text, and near-universal: each of these is on ~68% of all
 * rows, which is essentially every row carrying nutrition at all. Descriptions
 * outside this table (vitamins, minerals, and opaque `TEMP_*` codes) are
 * dropped.
 *
 * Energi is absent on purpose — it appears TWICE per product, once in kJ and
 * once in kcal with the same description, so it is resolved by unit below.
 */
const SLOT_BY_DESCRIPTION: Record<string, NutrientSlot> = {
  fett: 'fatG',
  'varav mättat fett': 'saturatedFatG',
  kolhydrat: 'carbohydrateG',
  'varav sockerarter': 'sugarsG',
  fiber: 'fiberG',
  protein: 'proteinG',
  salt: 'saltG',
};

/** The two energy rows, told apart by `unit` rather than by description. */
const ENERGY_SLOT_BY_UNIT: Record<string, NutrientSlot> = {
  kilokalori: 'energyKcal',
  kilojoule: 'energyKj',
};

/** UN/ECE unit codes Coop states a nutrition basis in, as contract symbols. */
const BASIS_UNIT_BY_CODE: Record<string, string> = {
  GRM: 'g',
  MLT: 'ml',
  H87: 'st',
};

/**
 * Read one `nutrientLinks[].amount` as a number. The field is `string |
 * string[]` holding values like `"12"`, `"3.6"`, `"0,5"` or `"<0,5"`, so this
 * takes the first entry, accepts a comma decimal separator, and reads the
 * leading number of an approximate value ("<0,5" → 0.5). Returns undefined for
 * anything with no number in it.
 */
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

/**
 * Map Coop's nutrient list onto the fixed contract slots. Returns undefined when
 * the row states no basis quantity, since "13 g of fat" per an unknown amount is
 * not a fact worth publishing. The basis unit falls back to grams, which is what
 * all but a handful of rows use.
 */
export function nutritionFromCoop(
  doc: Doc<'raw_coop'>,
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
    // First reading wins, so a duplicated nutrient can't silently overwrite one
    // that parsed cleanly.
    if (amount !== undefined && nutrition[slot] === undefined) {
      nutrition[slot] = amount;
    }
  }
  return nutrition;
}

/** A node in Coop's `navCategories` tree, structurally. The raw validator nests
 * a fixed four levels with a differently-typed leaf, so walking it needs a shape
 * the whole chain satisfies rather than the generated type. */
type NavNode = { name: string; superCategories?: unknown };

function isNavNode(value: unknown): value is NavNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NavNode).name === 'string'
  );
}

/**
 * Build the category breadcrumb, root first. `navCategories[0]` is the LEAF and
 * `superCategories` nests upward, so this is a reverse walk: "Övriga
 * smaksättare" under "Såser & dressing" under "Kryddor & Smaksättare" comes back
 * as `["Kryddor & Smaksättare", "Såser & dressing", "Övriga smaksättare"]`.
 * Depth-capped so a malformed chain can't spin.
 */
export function categoryPathFromCoop(
  doc: Doc<'raw_coop'>,
): string[] | undefined {
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

/**
 * Certification labels from `accreditedTags`. Tags carry a code and, usually, a
 * Swedish display name; the ones without a name are dropped rather than
 * unslugged, which would mean inventing a code→label table per store. Deduped,
 * because distinct codes share a name (FSC has a MIX and a LABEL variant).
 */
export function labelsFromCoop(doc: Doc<'raw_coop'>): string[] | undefined {
  const names = (doc.accreditedTags ?? []).flatMap((tag) => {
    const description = tag.description?.trim();
    return description ? [description] : [];
  });
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique : undefined;
}

/**
 * Make a Coop image URL usable by a browser. The raw field points at a Cloudinary
 * ORIGINAL over plain http, which for 97% of rows is a multi-megabyte TIFF that
 * no browser renders — served as-is it would be a broken image everywhere. This
 * upgrades the scheme and inserts Cloudinary's `f_auto,q_auto`, so the CDN
 * delivers a web format from the same asset (a 14 MB TIFF comes back as ~1 MB of
 * webp). Consumers may chain a width in front of it, e.g.
 * `/upload/w_120/f_auto,q_auto/`. Non-Cloudinary URLs are passed through with
 * only the scheme fixed.
 */
export function webImageUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const https = trimmed.replace(/^http:\/\//i, 'https://');
  return https.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/i,
    '$1f_auto,q_auto/',
  );
}

/** Trim a raw string field, treating blank as absent. */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Project a raw Coop product into clean fields. Returns null when the row has no
 * EAN or no name — the clean table requires both, so such rows are skipped.
 *
 * `food` is emitted only when the row actually has ingredients or nutrition, so
 * that its presence is a reliable "this is a consumable" signal and a toothbrush
 * carries no empty block for a UI to half-render.
 */
export const projectCoop: Projector<Doc<'raw_coop'>> = (doc) => {
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

/**
 * Every raw table's projector plus the store slug its rows belong to. Adding a
 * chain means adding its `raw_<chain>` table and one entry here; the type makes
 * a missing entry a compile error.
 */
export const projectors: {
  [T in SourceTable]: { store: StoreSlug; project: Projector<Doc<T>> };
} = {
  raw_coop: { store: 'coop', project: projectCoop },
};

/**
 * Run the registered projector for a raw table and attach provenance. Returns
 * null when the projector skips the row.
 */
export function project<T extends SourceTable>(
  table: T,
  doc: Doc<T>,
): CleanFields | null {
  const { store, project: projector } = projectors[table];
  const projected = projector(doc);
  if (!projected) return null;
  return { ...projected, store, sourceTable: table, sourceId: doc._id };
}

/**
 * Upsert one clean `catalog` row keyed by (store, EAN) — every source keeps its
 * own row for a shared EAN, and readers dedup across stores. Replaces an existing
 * row, else inserts and bumps the catalog counter. Returns true when a new row
 * was inserted.
 *
 * `replace` rather than `patch`, now that most columns are optional: a patch
 * ignores keys the incoming row does not have, so a value the source has since
 * dropped would linger on the clean row forever. A projection is a total
 * function of one raw row, so the projected fields ARE the row.
 */
export async function upsertClean(
  ctx: MutationCtx,
  fields: CleanFields,
): Promise<boolean> {
  const existing = await ctx.db
    .query('catalog')
    .withIndex('by_store_ean', (q) =>
      q.eq('store', fields.store).eq('ean', fields.ean),
    )
    .first();
  if (existing) {
    await ctx.db.replace(existing._id, fields);
    return false;
  }
  await ctx.db.insert('catalog', fields);
  await bumpCounter(ctx, CATALOG_COUNT_KEY, 1);
  return true;
}
