import { v, type Infer } from 'convex/values';
import { coopProductInformationFields } from '../schemes/coop';

/**
 * The Coop API regularly returns fields that aren't in our schema (e.g.
 * `displayLowerPrice`, `displayWeightPrice` — added by Coop after the catalog
 * schema was derived from the original 10k-product scrape). Convex object
 * validators are strict, so inserting the raw payload throws
 * `ArgumentValidationError: Object contains extra field ...`.
 *
 * `sanitizeCoopProduct` coerces a raw payload to exactly what the schema
 * declares: it recursively drops keys not present in the validator (at every
 * level, not just the top) and picks the matching branch of each union. It does
 * NOT convert types — genuine type drift is a schema change, not something to
 * paper over here.
 */

// Validator instances expose their structure at runtime (.kind/.fields/.element
// /.value/.members). There's no public type for walking them, so we treat the
// validator as `any` and lean on the known `kind` discriminator.
type AnyValidator = any;

const productValidator: AnyValidator = v.object(coopProductInformationFields);

/** Does `value`'s runtime shape plausibly fit `validator`'s kind? Used to pick
 *  a union branch (the schema's unions are scalar-vs-scalar or array-vs-record,
 *  so a shape check is enough to disambiguate). */
function matchesKind(value: unknown, validator: AnyValidator): boolean {
  switch (validator.kind) {
    case 'union':
      return validator.members.some((m: AnyValidator) => matchesKind(value, m));
    case 'object':
    case 'record':
      return (
        value !== null && typeof value === 'object' && !Array.isArray(value)
      );
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'float64':
    case 'int64':
      return typeof value === 'number' || typeof value === 'bigint';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'literal':
      return value === validator.value;
    default:
      // any / id / bytes — accept.
      return true;
  }
}

/** Recursively rebuild `value` keeping only what `validator` allows. */
function coerce(value: unknown, validator: AnyValidator): unknown {
  if (value === undefined) return undefined;

  switch (validator.kind) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        // Shape mismatch — hand it back unchanged and let the validator report it.
        return value;
      }
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(validator.fields)) {
        if (src[key] === undefined) continue; // missing / explicit-undefined → omit
        const cleaned = coerce(src[key], validator.fields[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }
    case 'array': {
      // Type mismatch (e.g. Coop returns a plain object where we expect an
      // array for some fields) — drop the field rather than pass invalid data.
      if (!Array.isArray(value)) return undefined;
      return value.map((el) => coerce(el, validator.element));
    }
    case 'record': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return value;
      }
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src)) {
        const cleaned = coerce(src[key], validator.value);
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }
    case 'union': {
      const branch =
        validator.members.find((m: AnyValidator) => matchesKind(value, m)) ??
        validator.members[0];
      return coerce(value, branch);
    }
    default:
      // Scalars / any / id / literal — keep as-is.
      return value;
  }
}

/**
 * A payload that fits `coopProductInformationFields` — exactly the `data`
 * argument `raw.upsertCoopByEan` takes. Declaring the return type here rather
 * than `Record<string, unknown>` is the one departure from the port source: it
 * saves every call site an `as any` on the write.
 */
export type CoopProduct = Infer<
  ReturnType<typeof v.object<typeof coopProductInformationFields>>
>;

export function sanitizeCoopProduct(raw: Record<string, unknown>): CoopProduct {
  return coerce(raw, productValidator) as CoopProduct;
}
