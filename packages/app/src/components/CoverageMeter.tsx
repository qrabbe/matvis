import { Stack, Text } from '@wordpress/ui';
import { formatPercent } from '../lib/format';
import type { Coverage } from '../lib/purchases';
import { CHART_CHROME, SERIES } from './chartTheme';

/**
 * How much of the account actually resolves to a product — a first-class
 * element on every product-dependent view, not an error state.
 *
 * This exists because of a fact about the system rather than a design
 * preference: `receiptItems.gtin` is the only join key between a receipt line
 * and a product, it is filled from `itemGtinMap`, and that table starts empty
 * with nothing filling it yet. So today this reads close to "0 of N matched".
 * A view that hid that would just look broken; a view that states it is honest,
 * and the number doubles as the progress bar for the matching engine.
 */
export function CoverageMeter({
  coverage,
  detail = false,
}: {
  coverage: Coverage;
  /** Show the full funnel underneath, not just the headline. Used on the
   * Unmapped tab, which is where the gap is the subject. */
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

  const ratio = matchedLines / totalLines;

  return (
    <Stack direction="column" gap="sm">
      <Text variant="body-sm">
        {`${matchedLines.toLocaleString('sv-SE')} of ${totalLines.toLocaleString('sv-SE')} lines matched to a product (${formatPercent(matchedLines, totalLines)}). ${nutritionLines.toLocaleString('sv-SE')} produced usable nutrition.`}
      </Text>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalLines}
        aria-valuenow={matchedLines}
        aria-label="Receipt lines matched to a catalog product"
        style={{
          height: 6,
          borderRadius: 3,
          background: CHART_CHROME.grid,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            // A non-zero match always shows at least a sliver: rounding a real
            // 0.4% down to an empty bar would read as "none", which is a
            // different fact.
            width: `${Math.max(ratio * 100, matchedLines > 0 ? 1 : 0)}%`,
            height: '100%',
            borderRadius: 3,
            background: SERIES.protein,
          }}
        />
      </div>

      {detail && <CoverageFunnel coverage={coverage} />}
    </Stack>
  );
}

/**
 * The funnel step by step, so it is clear WHERE coverage is lost — unmatched
 * text, an EAN nothing has catalogued, a product with no nutrition table, or a
 * unit that would not resolve. Each of those needs a different fix, so each is
 * worth its own row and its own one-line explanation. The explanations are plain
 * text rather than tooltips on purpose: `Tooltip` is visual-only, not exposed to
 * assistive technology and absent on touch, which is the wrong carrier for the
 * only thing that explains the number.
 */
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
