import type { CatalogNutrition, CatalogQuantity } from '@matvis/shared';
import { v } from 'convex/values';
import { nutritionValidator } from '../model/fields';

/** The wire shape of a parsed page, for the two functions that pass one across
 * a Convex boundary. Kept beside the type it validates so the two cannot drift.
 */
export const icaProductValidator = v.object({
  ean: v.string(),
  name: v.string(),
  brand: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  categoryPath: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  ingredients: v.optional(v.string()),
  nutrition: v.optional(nutritionValidator),
});

/** Everything an ICA product page yields, before it becomes a catalog row.
 * Parsing and projecting are separate so the parser can be tested against saved
 * HTML without a fetch, and so a markup change breaks one file. */
export type IcaProduct = {
  ean: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  categoryPath?: string[];
  description?: string;
  ingredients?: string;
  nutrition?: CatalogNutrition;
};

function decode(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#38;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** ICA states the product's own fields as schema.org microdata, one meta tag
 * per property. There is no JSON-LD block on the page. */
function meta(html: string, prop: string): string | undefined {
  const match = new RegExp(
    `<meta[^>]*itemprop="${prop}"[^>]*content="([^"]*)"`,
  ).exec(html);
  return match ? decode(match[1]!) : undefined;
}

function link(html: string, prop: string): string | undefined {
  const match = new RegExp(
    `<link[^>]*itemprop="${prop}"[^>]*href="([^"]*)"`,
  ).exec(html);
  return match ? decode(match[1]!) : undefined;
}

/** `categories` is a JSON array in an attribute, already leaf-last flat, which
 * is why ICA needs none of the `superCategories` walk Coop does. */
export function categoryPathFromIca(html: string): string[] | undefined {
  const raw = meta(html, 'categories');
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const path = parsed.filter(
      (part): part is string => typeof part === 'string',
    );
    return path.length > 0 ? path : undefined;
  } catch {
    return undefined;
  }
}

/** The brand sits in a nested `itemprop="brand"` block rather than on a meta of
 * its own, so it is read as the first `name` after that marker. */
export function brandFromIca(html: string): string | undefined {
  const at = html.search(/itemprop="brand"/);
  if (at < 0) return undefined;
  const after = html.slice(at);
  const match = /<meta[^>]*itemprop="name"[^>]*content="([^"]*)"/.exec(after);
  return text(match ? decode(match[1]!) : undefined);
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The ingredients block is prose under an "Ingredienser" heading. ICA repeats
 * the word inside the text itself often enough that the leading label is
 * dropped when it is there. */
export function ingredientsFromIca(html: string): string | undefined {
  const match = /Ingredienser\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*([^<]{4,4000})/.exec(
    html,
  );
  if (!match) return undefined;
  const body = stripTags(match[1]!).replace(/^Ingredienser:\s*/i, '');
  return text(body);
}

const SLOT_BY_LABEL: Record<
  string,
  Exclude<keyof CatalogNutrition, 'basisQuantity' | 'basisUnit'>
> = {
  fett: 'fatG',
  'varav mättat fett': 'saturatedFatG',
  kolhydrat: 'carbohydrateG',
  'varav sockerarter': 'sugarsG',
  fiber: 'fiberG',
  protein: 'proteinG',
  salt: 'saltG',
  'energi (kcal)': 'energyKcal',
  'energi (kj)': 'energyKj',
};

const BASIS_UNIT: Record<string, 'g' | 'ml'> = {
  gram: 'g',
  g: 'g',
  milliliter: 'ml',
  ml: 'ml',
};

function amount(cell: string): number | undefined {
  const match = /-?\d+(?:[.,]\d+)?/.exec(cell);
  if (!match) return undefined;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

/** The "Näringsdeklaration" table, whose row labels are the same Swedish
 * vocabulary Coop uses, so the two chains produce identical nutrition shapes.
 *
 * The header's second cell carries the basis, always "100 Gram" or "100 ml" in
 * the sampled range. Nutrients outside `CatalogNutrition`'s fixed slots, such
 * as the Vitamin C row some products carry, are dropped rather than invented
 * into the shape, and the "% av DRI" column is not a nutrient at all. */
export function nutritionFromIca(html: string): CatalogNutrition | undefined {
  const table =
    /Näringsdeklaration[\s\S]{0,400}?<table>([\s\S]*?)<\/table>/.exec(html);
  if (!table) return undefined;

  const rows = [...table[1]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1]!.matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((cell) =>
      stripTags(cell[1]!),
    ),
  );
  if (rows.length === 0) return undefined;

  const header = rows[0]!;
  const basis = /(\d+(?:[.,]\d+)?)\s*(gram|g|milliliter|ml)\b/i.exec(
    header[1] ?? '',
  );
  if (!basis) return undefined;

  const nutrition: CatalogNutrition = {
    basisQuantity: Number(basis[1]!.replace(',', '.')),
    basisUnit: BASIS_UNIT[basis[2]!.toLowerCase()] ?? 'g',
  };

  for (const row of rows.slice(1)) {
    const slot = SLOT_BY_LABEL[(row[0] ?? '').trim().toLowerCase()];
    if (!slot) continue;
    const value = amount(row[1] ?? '');
    if (value !== undefined && nutrition[slot] === undefined) {
      nutrition[slot] = value;
    }
  }
  return nutrition;
}

/** Unit spellings that appear as a package size suffix in an ICA product name.
 *
 * `mm` is deliberately absent even though CATALOG_UNITS carries it. The only
 * millimetre figures in the range are things like the `3,5mm` on a headphone
 * adapter, which is a jack diameter and not a net content. Same reasoning keeps
 * `lm` and `W` out: `300lm(28W)` describes a lamp. */
const NAME_UNIT: Record<string, { unit: 'g' | 'ml'; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
};

/** A number glued to one of those units, standing as its own word. The word
 * boundaries are what keep `100%`, `4-pack` and `20-p` out. */
const NAME_SIZE =
  /(?:^|[\s(])(\d+(?:[.,]\d+)?)\s?(kg|gr|g|ml|cl|dl|l)(?=$|[\s),])/gi;

/** ICA publishes no net content field anywhere: not in the microdata, not on
 * the page, not in the sitemap. The only statement of pack size is inside the
 * product name, so this reads it from there.
 *
 * Exactly one match, or nothing. A name stating two sizes is genuinely
 * ambiguous rather than nearly right: "Inlagd Sill 400g varav sill 210g" is a
 * 400 g jar and "Hamburgare 4-p 113g 452g" is four 113 g patties. Guessing
 * which number is the pack would be wrong about half the time, and an absent
 * optional field beats a confident wrong one.
 *
 * Measured over the 34 437 name range: 19 456 resolve, 10 are ambiguous, and
 * the remaining 14 971 state no size because they are speakers, toys, lamps or
 * count-priced produce. */
export function netContentFromName(name: string): CatalogQuantity | undefined {
  const hits = [...name.matchAll(NAME_SIZE)];
  if (hits.length !== 1) return undefined;
  const [, number, spelling] = hits[0]!;
  const resolved = NAME_UNIT[spelling!.toLowerCase()];
  if (!resolved) return undefined;
  const value = Number(number!.replace(',', '.')) * resolved.factor;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return { value, unit: resolved.unit };
}

/** Pulls one product page apart. Returns null when the page carries no EAN or
 * no name, which is the same bar `projectCoop` holds a Coop payload to. */
export function parseIcaProduct(html: string): IcaProduct | null {
  // `text` inside each branch rather than around the pair. `meta` answers `''`
  // for a `content=""` attribute rather than undefined, and `'' ?? mpn` is `''`,
  // so the fallback never ran on the one page shape it exists for.
  const ean = text(meta(html, 'sku')) ?? text(meta(html, 'mpn'));
  const name = text(meta(html, 'name'));
  if (!ean || !name) return null;

  return {
    ean,
    name,
    brand: brandFromIca(html),
    imageUrl: text(link(html, 'image')),
    categoryPath: categoryPathFromIca(html),
    description: text(meta(html, 'description')),
    ingredients: ingredientsFromIca(html),
    nutrition: nutritionFromIca(html),
  };
}
