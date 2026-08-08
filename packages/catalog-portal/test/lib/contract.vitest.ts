import { describe, expect, it } from 'vitest';
import { CatalogItem } from '@matvis/shared';
import {
  MODELS,
  OPERATIONS,
  operationName,
  signature,
  typeExpression,
} from '../../src/lib/contract';

/**
 * The dev portal is generated from two sources — the zod contract and the
 * committed function spec — so these assert the generated result still says
 * what the page promises. A field added without a `.meta({ description })`, or
 * a signature that stops matching the deployment, fails here.
 */

describe('models', () => {
  it('names CatalogItem and the blocks it references', () => {
    expect(MODELS.map((model) => model.name)).toEqual([
      'CatalogItem',
      'CatalogQuantity',
      'CatalogFood',
      'CatalogNutrition',
    ]);
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

  it('expands store to the real slugs and names nested models', () => {
    const typeOf = (model: string, field: string) =>
      MODELS.find((m) => m.name === model)?.fields.find((f) => f.name === field)
        ?.type;
    expect(typeOf('CatalogItem', 'store')).toContain('"coop"');
    expect(typeOf('CatalogItem', 'categoryPath')).toBe('string[]');
    expect(typeOf('CatalogItem', 'food')).toBe('CatalogFood');
    expect(typeOf('CatalogFood', 'nutrition')).toBe('CatalogNutrition');
  });

  it('has a note on every field', () => {
    const unnoted = MODELS.flatMap((model) =>
      model.fields
        .filter((field) => field.note === '')
        .map((field) => `${model.name}.${field.name}`),
    );
    expect(unnoted).toEqual([]);
  });
});

describe('operations', () => {
  it('lists the four public catalog queries', () => {
    expect(OPERATIONS.map(operationName)).toEqual([
      'getByEan',
      'getManyByEan',
      'search',
      'stats',
    ]);
    expect(OPERATIONS.every((op) => op.functionType === 'Query')).toBe(true);
  });

  it('builds each signature from the declared arguments', () => {
    expect(OPERATIONS.map(signature)).toEqual([
      'catalog.getByEan({ ean })',
      'catalog.getManyByEan({ eans })',
      'catalog.search({ q?, paginationOpts })',
      'catalog.stats()',
    ]);
  });

  it('collapses a catalog row in a response back to its model name', () => {
    const byName = (name: string) =>
      OPERATIONS.find((op) => operationName(op) === name)!;
    expect(typeExpression(byName('getByEan').returns)).toBe('CatalogItem[]');
    expect(typeExpression(byName('search').returns)).toContain(
      'page: CatalogItem[]',
    );
    expect(typeExpression(byName('stats').returns)).toContain('total: number');
  });
});
