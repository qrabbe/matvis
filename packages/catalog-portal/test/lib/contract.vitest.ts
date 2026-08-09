import { describe, expect, it } from 'vitest';
import { CatalogItem } from '@matvis/shared';
import {
  MODELS,
  OPERATIONS,
  operationName,
  signature,
  typeExpression,
  type ModelField,
} from '../../src/lib/contract';

/**
 * The dev portal is generated from two sources — the zod contract and the
 * committed function spec — so these assert the generated result still says
 * what the page promises. A field added without a `.meta({ description })`, or
 * a signature that stops matching the deployment, fails here.
 */

describe('models', () => {
  it('names CatalogItem and the blocks it references', () => {
    // One root. The referenced blocks are nested inside the fields that
    // carry them rather than listed beside them.
    expect(MODELS.map((model) => model.name)).toEqual(['CatalogItem']);
  });

  it('derives required from .optional() rather than from a hand-kept list', () => {
    const item = MODELS[0]!;
    const required = item.fields
      .filter((field) => field.required)
      .map((field) => field.name);
    expect(required).toEqual(['ean', 'name', 'store']);
    expect(item.fields.map((field) => field.name)).toEqual(
      Object.keys(CatalogItem.shape),
    );
  });

  it('expands store to the real slugs and nests the referenced blocks', () => {
    const item = MODELS[0]!;
    const field = (fields: ModelField[], name: string) =>
      fields.find((f) => f.name === name);

    expect(field(item.fields, 'store')!.type).toContain('"coop"');
    expect(field(item.fields, 'categoryPath')!.type).toBe('string[]');

    const food = field(item.fields, 'food')!;
    expect(food.type).toBe('CatalogFood');
    // The link that used to be thrown away at render: the block is inside the
    // field that carries it, not a sibling section further down.
    expect(food.fields?.map((f) => f.name)).toEqual([
      'ingredients',
      'nutrition',
    ]);

    const nutrition = field(food.fields!, 'nutrition')!;
    expect(nutrition.type).toBe('CatalogNutrition');
    expect(nutrition.fields?.map((f) => f.name)).toContain('basisUnit');

    const netContent = field(item.fields, 'netContent')!;
    expect(netContent.fields?.map((f) => f.name)).toEqual(['value', 'unit']);
  });

  it('has a note on every field, nested ones included', () => {
    const walk = (fields: ModelField[], path: string): string[] =>
      fields.flatMap((field) => [
        ...(field.note === '' ? [`${path}.${field.name}`] : []),
        ...(field.fields ? walk(field.fields, `${path}.${field.name}`) : []),
      ]);

    const unnoted = MODELS.flatMap((model) => walk(model.fields, model.name));
    expect(unnoted).toEqual([]);
  });
});

describe('operations', () => {
  it('lists the public catalog queries, and only queries', () => {
    // `search:logSearch` is deliberately absent: it is a write, and it lives
    // outside the module the spec walks so the contract stays read-only.
    expect(OPERATIONS.map(operationName)).toEqual([
      'getByEan',
      'getManyByEan',
      'health',
      'search',
    ]);
    expect(OPERATIONS.every((op) => op.functionType === 'Query')).toBe(true);
  });

  it('builds each signature from the declared arguments', () => {
    expect(OPERATIONS.map(signature)).toEqual([
      'catalog.getByEan({ ean })',
      'catalog.getManyByEan({ eans })',
      'catalog.health()',
      'catalog.search({ q?, paginationOpts })',
    ]);
  });

  it('collapses a catalog row in a response back to its model name', () => {
    const byName = (name: string) =>
      OPERATIONS.find((op) => operationName(op) === name)!;
    expect(typeExpression(byName('getByEan').returns)).toBe('CatalogItem[]');
    expect(typeExpression(byName('search').returns)).toContain(
      'page: CatalogItem[]',
    );
    expect(typeExpression(byName('health').returns)).toContain('total: number');
  });
});
