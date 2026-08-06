import { Button, InputControl, Stack } from '@wordpress/ui';
import {
  normalizeRange,
  presetRange,
  RANGE_PRESETS,
  type DateRange,
  type RangePresetId,
} from '../lib/dateRange';

export function DateRangePicker({
  range,
  onChange,
  earliest,
  activePreset,
  onPresetChange,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  earliest?: string;
  activePreset: RangePresetId | null;
  onPresetChange: (preset: RangePresetId) => void;
}) {
  return (
    <Stack direction="row" gap="md" wrap="wrap" align="end">
      <Stack direction="row" gap="xs" wrap="wrap">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="compact"
            variant={activePreset === preset.id ? 'solid' : 'outline'}
            tone={activePreset === preset.id ? 'brand' : 'neutral'}
            onClick={() => {
              onPresetChange(preset.id);
              onChange(presetRange(preset.id, new Date(), earliest));
            }}
          >
            {preset.label}
          </Button>
        ))}
      </Stack>

      <Stack direction="row" gap="sm" align="end">
        <InputControl
          type="date"
          label="From"
          size="compact"
          value={range.from}
          onValueChange={(value) =>
            onChange(normalizeRange({ ...range, from: value }))
          }
        />
        <InputControl
          type="date"
          label="To"
          size="compact"
          value={range.to}
          onValueChange={(value) =>
            onChange(normalizeRange({ ...range, to: value }))
          }
        />
      </Stack>
    </Stack>
  );
}
