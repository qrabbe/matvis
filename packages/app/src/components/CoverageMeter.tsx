import { Stack, Text } from '@wordpress/ui';
import { formatPercent } from '../lib/format';
import type { Coverage } from '../lib/purchases';
import { SERIES } from './chartTheme';
import { Meter } from './Meter';

export function CoverageMeter({
  coverage,
  detail = false,
}: {
  coverage: Coverage;
  detail?: boolean;
}) {
  const { totalLines, matchedLines, nutritionLines } = coverage;

  if (totalLines === 0) {
    return (
      <Text variant="body-sm">
        No line items loaded yet — coverage appears once receipts hydrate.
      </Text>
    );
  }

  return (
    <Stack direction="column" gap="sm">
      <Text variant="body-sm">
        {`${matchedLines.toLocaleString('sv-SE')} of ${totalLines.toLocaleString('sv-SE')} lines matched to a product (${formatPercent(matchedLines, totalLines)}). ${nutritionLines.toLocaleString('sv-SE')} produced usable nutrition.`}
      </Text>

      <Meter
        value={matchedLines}
        max={totalLines}
        label="Receipt lines matched to a catalog product"
        fill={SERIES.protein}
      />

      {detail && <CoverageFunnel coverage={coverage} />}
    </Stack>
  );
}

function CoverageFunnel({ coverage }: { coverage: Coverage }) {
  const rows: { label: string; value: number; hint: string }[] = [
    {
      label: 'Non-discount lines',
      value: coverage.totalLines,
      hint: 'Every purchased line across the receipts loaded.',
    },
    {
      label: 'Carry an EAN',
      value: coverage.matchedLines,
      hint: 'The connector resolved the printed text through itemGtinMap.',
    },
    {
      label: 'Found in the catalog',
      value: coverage.catalogedLines,
      hint: 'That EAN has a row in the clean catalog.',
    },
    {
      label: 'No nutrition table',
      value: coverage.noNutritionLines,
      hint: 'Catalogued, but the source carries no nutrition — often a non-food.',
    },
    {
      label: 'Not scalable',
      value: coverage.notScalableLines,
      hint: 'Has nutrition, but the package unit would not resolve into the basis unit. Counted rather than guessed at.',
    },
    {
      label: 'Usable nutrition',
      value: coverage.nutritionLines,
      hint: 'Produced real macros. What Nutrition and Pantry rest on.',
    },
  ];

  return (
    <Stack direction="column" gap="sm" style={{ paddingTop: 4 }}>
      {rows.map((row) => (
        <Stack key={row.label} direction="row" gap="md" justify="space-between">
          <Stack direction="column" gap="xs" style={{ minWidth: 0 }}>
            <Text variant="body-sm">{row.label}</Text>
            <Text variant="body-sm" style={{ opacity: 0.7 }}>
              {row.hint}
            </Text>
          </Stack>
          <Text variant="body-md">{row.value.toLocaleString('sv-SE')}</Text>
        </Stack>
      ))}
    </Stack>
  );
}
