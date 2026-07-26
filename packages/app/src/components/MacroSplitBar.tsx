import { Stack, Text } from '@wordpress/ui';
import { energySplit, type Macros } from '../lib/nutrition';
import { SERIES } from './chartTheme';

/**
 * Where the energy came from: protein / fat / carbohydrate as a share of
 * kcal, on the standard Atwater factors (4 / 9 / 4).
 *
 * This is the app's only chart with more than one series on it, which makes it
 * the only place the categorical palette is load-bearing — see
 * `chartTheme.ts` for the validated three slots.
 *
 * Every segment carries a direct label, so identity never rests on colour
 * alone. That is also the secondary encoding the blue/rose pair wants: it clears
 * the protan and deutan thresholds comfortably but sits closer under tritanopia,
 * and a label costs nothing here.
 */
export function MacroSplitBar({ macros }: { macros: Macros }) {
  const split = energySplit(macros);
  if (!split) {
    return (
      <Text variant="body-sm">
        No energy split yet — no line has both a product and a usable nutrition
        table.
      </Text>
    );
  }

  const segments = [
    {
      key: 'protein',
      label: 'Protein',
      share: split.protein,
      color: SERIES.protein,
    },
    { key: 'fat', label: 'Fat', share: split.fat, color: SERIES.fat },
    { key: 'carbs', label: 'Carbs', share: split.carbs, color: SERIES.carbs },
  ] as const;

  return (
    <Stack direction="column" gap="sm">
      <Stack
        direction="row"
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${Math.round(s.share * 100)}%`)
          .join(', ')}
        style={{ height: 10, borderRadius: 5, overflow: 'hidden' }}
      >
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            style={{
              width: `${segment.share * 100}%`,
              background: segment.color,
              // A 2px surface gap between fills, so two adjacent segments read
              // as two marks rather than as one blended band.
              marginLeft: index === 0 ? 0 : 2,
            }}
          />
        ))}
      </Stack>
      <Stack direction="row" gap="md" wrap="wrap">
        {segments.map((segment) => (
          <Stack
            key={segment.key}
            direction="row"
            gap="xs"
            align="center"
            aria-hidden
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: segment.color,
                flexShrink: 0,
              }}
            />
            {/* Text keeps its own ink; the swatch beside it carries identity. */}
            <Text variant="body-sm">
              {segment.label} {Math.round(segment.share * 100)}%
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
