export type TargetKey =
  'energy' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'saturatedFat' | 'salt';

export type TargetDirection = 'atLeast' | 'atMost';

export interface TargetDefinition {
  label: string;
  unit: string;
  defaultValue: number;
  /** Whether the value on the weekly card is read as a floor (fibre) or a
   * ceiling (everything else, including energy/protein/fat/carbs, which
   * read as "of" rather than "at most" but share the same bar visual). */
  direction: TargetDirection;
}

/** Defaults for an average, moderately active adult man — see
 * `reference-ux-plan.html`'s Settings table for the NNR 2023 basis of
 * each. The single source of truth for "what a target is if nobody has
 * touched it" — never duplicated into a stored row (see `schema.ts`'s
 * `settings` table doc comment). */
export const TARGET_DEFINITIONS: Record<TargetKey, TargetDefinition> = {
  energy: {
    label: 'Energy',
    unit: 'kcal',
    defaultValue: 2500,
    direction: 'atMost',
  },
  protein: {
    label: 'Protein',
    unit: 'g',
    defaultValue: 100,
    direction: 'atMost',
  },
  fat: { label: 'Fat', unit: 'g', defaultValue: 85, direction: 'atMost' },
  carbs: {
    label: 'Carbohydrate',
    unit: 'g',
    defaultValue: 300,
    direction: 'atMost',
  },
  fiber: { label: 'Fibre', unit: 'g', defaultValue: 35, direction: 'atLeast' },
  saturatedFat: {
    label: 'Saturated fat',
    unit: 'g',
    defaultValue: 28,
    direction: 'atMost',
  },
  salt: { label: 'Salt', unit: 'g', defaultValue: 6, direction: 'atMost' },
};

export type TargetValues = Partial<
  Record<TargetKey, number | null | undefined>
>;

/** Resolves one target's effective state: on with a value, or off. Absent
 * or `undefined` in `stored` means "on, at the default" — the lean-storage
 * contract `schema.ts` documents. */
export function resolveTarget(
  key: TargetKey,
  stored: TargetValues,
): { enabled: boolean; value: number } {
  const raw = stored[key];
  if (raw === null)
    return { enabled: false, value: TARGET_DEFINITIONS[key].defaultValue };
  return { enabled: true, value: raw ?? TARGET_DEFINITIONS[key].defaultValue };
}
