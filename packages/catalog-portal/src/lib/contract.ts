import { z } from 'zod';
import { CatalogItem } from '@matvis/shared';
import rawSpec from '../generated/catalog-api-spec.json';

// ── The catalog contract, read rather than retyped ───────────────────────────
// Two generated sources feed the dev portal, so neither the field tables nor
// the operation list can drift from what the deployment actually serves.
//
// The models come from `z.toJSONSchema(CatalogItem)`. Every field note lives on
// the field as `.meta({ description })` in packages/shared/src/catalog.ts, and
// `required` falls out of `.optional()` rather than being marked by hand.
//
// The operations come from src/generated/catalog-api-spec.json, which
// `bun run spec` writes out of packages/catalog/convex/catalog.ts and CI fails
// on when stale (see the `spec:check` gate in .github/workflows/ci.yml).

// ── Convex function spec ─────────────────────────────────────────────────────

export type ValidatorNode =
  | {
      type: 'string' | 'number' | 'boolean' | 'bigint' | 'null' | 'any';
      value?: never;
    }
  | { type: 'id'; tableName: string }
  | { type: 'literal'; value: unknown }
  | { type: 'array'; value: ValidatorNode }
  | { type: 'union'; value: ValidatorNode[] }
  | { type: 'object'; value: Record<string, ObjectField> };

export type ObjectField = { fieldType: ValidatorNode; optional: boolean };

export type Operation = {
  identifier: string;
  functionType: string;
  args: Extract<ValidatorNode, { type: 'object' }>;
  returns: ValidatorNode;
};

/** Every public catalog function, in the order the page lists them. The JSON is
 * generated, so it is typed here the way `convexApi.ts` types `anyApi`. */
export const OPERATIONS = (rawSpec as unknown as { functions: Operation[] })
  .functions;

/** `catalog.js:search` → `search`. */
export function operationName(op: Operation): string {
  return op.identifier.slice(op.identifier.indexOf(':') + 1);
}

/** The call as a consumer writes it, e.g. `catalog.search({ q?, store?, … })`. */
export function signature(op: Operation): string {
  const args = Object.entries(op.args.value).map(
    ([name, field]) => `${name}${field.optional ? '?' : ''}`,
  );
  return `catalog.${operationName(op)}(${args.length ? `{ ${args.join(', ')} }` : ''})`;
}

/**
 * Field names a stored catalog row has: the contract's own plus the two system
 * fields Convex adds. Lets a row-shaped object collapse back to its model name
 * instead of inlining eighteen fields into every response type.
 */
const CATALOG_ROW_FIELDS = new Set([
  '_id',
  '_creationTime',
  ...Object.keys(CatalogItem.shape),
]);

function isCatalogRow(fields: Record<string, ObjectField>): boolean {
  const names = Object.keys(fields);
  return (
    names.length === CATALOG_ROW_FIELDS.size &&
    names.every((name) => CATALOG_ROW_FIELDS.has(name))
  );
}

/** A validator tree as the TypeScript type a client sees. */
export function typeExpression(node: ValidatorNode): string {
  switch (node.type) {
    case 'id':
      return `Id<"${node.tableName}">`;
    case 'literal':
      return JSON.stringify(node.value);
    case 'array': {
      const item = typeExpression(node.value);
      return item.includes(' | ') ? `(${item})[]` : `${item}[]`;
    }
    case 'union':
      return node.value.map(typeExpression).join(' | ');
    case 'object': {
      if (isCatalogRow(node.value)) return 'CatalogItem';
      const fields = Object.entries(node.value).map(
        ([name, field]) =>
          `${name}${field.optional ? '?' : ''}: ${typeExpression(field.fieldType)}`,
      );
      return fields.length === 0 ? '{}' : `{ ${fields.join('; ')} }`;
    }
    default:
      return node.type;
  }
}

// ── Models, from the zod contract ────────────────────────────────────────────

type SchemaNode = {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  $ref?: string;
};

export type ModelField = {
  name: string;
  type: string;
  required: boolean;
  note: string;
};

export type Model = { name: string; fields: ModelField[] };

/** One property as a type expression. A `$ref` is a named model, so it renders
 * as that name and sends the reader to its own table below. */
function schemaType(node: SchemaNode): string {
  if (node.$ref) return node.$ref.slice(node.$ref.lastIndexOf('/') + 1);
  if (node.enum)
    return node.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (node.type === 'array' && node.items) return `${schemaType(node.items)}[]`;
  return node.type ?? 'unknown';
}

function modelFrom(name: string, node: SchemaNode): Model {
  const required = new Set(node.required ?? []);
  return {
    name,
    fields: Object.entries(node.properties ?? {}).map(([field, property]) => ({
      name: field,
      type: schemaType(property),
      required: required.has(field),
      note: property.description ?? '',
    })),
  };
}

const catalogItemSchema = z.toJSONSchema(CatalogItem) as SchemaNode & {
  $defs?: Record<string, SchemaNode>;
};

/** `CatalogItem` first, then the blocks it references. The nested models are
 * named rather than inlined because they carry a `.meta({ id })`. */
export const MODELS: Model[] = [
  modelFrom('CatalogItem', catalogItemSchema),
  ...Object.entries(catalogItemSchema.$defs ?? {}).map(([name, node]) =>
    modelFrom(name, node),
  ),
];
