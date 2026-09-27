import type { Macros } from './nutrition';

export type TargetKey =
	'energy' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'saturatedFat' | 'salt';

export type TargetDirection = 'atLeast' | 'atMost' | 'goal';

export interface TargetDefinition {
	label: string;
	unit: string;
	macro: keyof Macros;
	defaultValue: number;
	direction: TargetDirection;
}

/**
 * Per day, for an average, moderately active adult man: NNR 2023 energy
 * shares at 2 500 kcal, fibre from NNR 2023, salt from Livsmedelsverket.
 * Never stored: a settings row only holds what someone changed.
 */
export const TARGET_DEFINITIONS: Record< TargetKey, TargetDefinition > = {
	energy: {
		label: 'Energy',
		unit: 'kcal',
		macro: 'kcal',
		defaultValue: 2500,
		direction: 'goal',
	},
	protein: {
		label: 'Protein',
		unit: 'g',
		macro: 'protein',
		defaultValue: 100,
		direction: 'goal',
	},
	fat: {
		label: 'Fat',
		unit: 'g',
		macro: 'fat',
		defaultValue: 85,
		direction: 'goal',
	},
	carbs: {
		label: 'Carbohydrate',
		unit: 'g',
		macro: 'carbs',
		defaultValue: 300,
		direction: 'goal',
	},
	fiber: {
		label: 'Fibre',
		unit: 'g',
		macro: 'fiber',
		defaultValue: 35,
		direction: 'atLeast',
	},
	saturatedFat: {
		label: 'Saturated fat',
		unit: 'g',
		macro: 'saturatedFat',
		defaultValue: 28,
		direction: 'atMost',
	},
	salt: {
		label: 'Salt',
		unit: 'g',
		macro: 'salt',
		defaultValue: 6,
		direction: 'atMost',
	},
};

export type TargetValues = Partial<
	Record< TargetKey, number | null | undefined >
>;

/**
 * Resolves one target's effective state: on with a value, or off. Absent
 * or `undefined` in `stored` means "on, at the default" — the lean-storage
 * contract `schema.ts` documents.
 */
export function resolveTarget(
	key: TargetKey,
	stored: TargetValues
): { enabled: boolean; value: number } {
	const raw = stored[ key ];
	if ( raw === null ) {
		return {
			enabled: false,
			value: TARGET_DEFINITIONS[ key ].defaultValue,
		};
	}
	return {
		enabled: true,
		value: raw ?? TARGET_DEFINITIONS[ key ].defaultValue,
	};
}

export function missesTarget(
	direction: TargetDirection,
	perDay: number,
	target: number
): boolean {
	if ( direction === 'atLeast' ) {
		return perDay < target;
	}
	if ( direction === 'atMost' ) {
		return perDay > target;
	}
	return false;
}
