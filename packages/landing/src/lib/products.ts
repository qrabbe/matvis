export type Shape =
	'carton' | 'tub' | 'loaf' | 'block' | 'box' | 'can' | 'bag' | 'jar';

export type Product = { shape: Shape; tint: string };

/**
 * The carton at index 0 is the milk highlighted on the receipt, the shelf
 * and the pantry alike — keep it first if you reorder this list.
 */
export const PLACEHOLDER_PRODUCTS: Product[] = [
	{ shape: 'carton', tint: '#5b7fc7' },
	{ shape: 'tub', tint: '#e0b04a' },
	{ shape: 'loaf', tint: '#c98a4b' },
	{ shape: 'block', tint: '#e8cf6a' },
	{ shape: 'box', tint: '#3f8f5a' },
	{ shape: 'can', tint: '#c9483e' },
	{ shape: 'bag', tint: '#7a5a8c' },
	{ shape: 'jar', tint: '#d27a3a' },
];
