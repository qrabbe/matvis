import { Stack, Text } from '@wordpress/ui';
import { energySplit, type Macros } from '../lib/nutrition';
import { SERIES } from './chartTheme';

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
            <Text variant="body-sm">
              {segment.label} {Math.round(segment.share * 100)}%
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
