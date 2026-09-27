import { describe, expect, it } from 'bun:test';
import { resolveTarget, TARGET_DEFINITIONS } from '../../src/lib/targets';

describe( 'resolveTarget', () => {
	it( 'is enabled at the default when nothing is stored', () => {
		expect( resolveTarget( 'protein', {} ) ).toEqual( {
			enabled: true,
			value: TARGET_DEFINITIONS.protein.defaultValue,
		} );
	} );

	it( 'is enabled at a custom value when a number is stored', () => {
		expect( resolveTarget( 'protein', { protein: 150 } ) ).toEqual( {
			enabled: true,
			value: 150,
		} );
	} );

	it( 'is disabled when null is stored, but still reports the default value', () => {
		expect( resolveTarget( 'salt', { salt: null } ) ).toEqual( {
			enabled: false,
			value: TARGET_DEFINITIONS.salt.defaultValue,
		} );
	} );

	it( 'treats an explicit undefined the same as absent', () => {
		expect( resolveTarget( 'fiber', { fiber: undefined } ) ).toEqual( {
			enabled: true,
			value: TARGET_DEFINITIONS.fiber.defaultValue,
		} );
	} );
} );
