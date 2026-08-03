import { describe, expect, it } from 'vitest';
import { OPERATIONS, operationName } from '../../src/lib/contract';
import { argInputs, buildArgs } from '../../src/lib/tryIt';

/**
 * The try-it form is derived from the generated spec, so an argument that
 * changes type changes the input a reader gets. These pin the derivation, and
 * the argument object that goes over the wire.
 */

const byName = (name: string) =>
  OPERATIONS.find((op) => operationName(op) === name)!;

describe('argInputs', () => {
  it('picks an input per argument and hides the one it supplies', () => {
    expect(argInputs(byName('search'))).toEqual([
      {
        name: 'q',
        optional: true,
        kind: 'text',
        options: [],
        example: 'kaffe',
      },
      {
        name: 'store',
        optional: true,
        kind: 'choice',
        options: expect.arrayContaining(['coop', 'ica']),
        example: '',
      },
    ]);
  });

  it('reads a string array as a list', () => {
    expect(argInputs(byName('getManyByEan'))[0]).toMatchObject({
      name: 'eans',
      kind: 'list',
      optional: false,
    });
  });

  it('asks for nothing when the operation takes nothing', () => {
    expect(argInputs(byName('stats'))).toEqual([]);
  });
});

describe('buildArgs', () => {
  it('splits a list on commas and whitespace', () => {
    expect(
      buildArgs(byName('getManyByEan'), { eans: '111, 222  333' }),
    ).toEqual({ eans: ['111', '222', '333'] });
  });

  it('leaves an empty optional out, and supplies paginationOpts', () => {
    expect(buildArgs(byName('search'), { q: '', store: '  ' })).toEqual({
      paginationOpts: { numItems: 3, cursor: null },
    });
  });

  it('sends a required argument even when it is empty', () => {
    expect(buildArgs(byName('getByEan'), {})).toEqual({ ean: '' });
  });
});
