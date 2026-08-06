import { v, type Infer } from 'convex/values';
import { coopProductInformationFields } from '../schemes/coop';

/** Drops keys the validator does not declare, at every level. Never converts a
 * type: genuine drift is a schema change, not something to paper over. */
type AnyValidator = any;

const productValidator: AnyValidator = v.object(coopProductInformationFields);

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
      return true;
  }
}

function coerce(value: unknown, validator: AnyValidator): unknown {
  if (value === undefined) return undefined;

  switch (validator.kind) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return value;
      }
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(validator.fields)) {
        if (src[key] === undefined) continue;
        const cleaned = coerce(src[key], validator.fields[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }
    case 'array': {
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
      return value;
  }
}

export type CoopProduct = Infer<
  ReturnType<typeof v.object<typeof coopProductInformationFields>>
>;

export function sanitizeCoopProduct(raw: Record<string, unknown>): CoopProduct {
  return coerce(raw, productValidator) as CoopProduct;
}
