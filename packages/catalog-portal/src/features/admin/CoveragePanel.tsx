import { useQuery } from 'convex/react';
import { Card, EmptyState, Stack, Text } from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { adminApi } from '../../lib/adminApi';
import { formatAge, formatCount } from './format';

/** Everything past ean, name and store is optional on a catalog row, so these
 * shares are what say whether ingest is degrading. They are also the measured
 * replacements for the percentages the developer page used to assert. */
const FIELD_LABELS: Record<string, string> = {
  brand: 'Brand',
  imageUrl: 'Image',
  netContent: 'Net content',
  categoryPath: 'Category path',
  countryOfOrigin: 'Country of origin',
  labels: 'Labels',
  food: 'Food block',
  foodIngredients: 'Ingredients',
  foodNutrition: 'Nutrition',
};

export function CoveragePanel({ token }: { token: string }) {
  const coverage = useQuery(adminApi.admin.coverage, { token });

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Field coverage</Card.Title>
      </Card.Header>
      <Card.Content>
        {coverage === undefined ? (
          <SkeletonList label="Loading coverage…" rows={4} />
        ) : coverage === null ? null : coverage.measuredAt === null ? (
          <EmptyState.Root>
            <EmptyState.Title>Not measured yet</EmptyState.Title>
            <EmptyState.Description>
              Coverage is counted on demand, not maintained on every write.
              Pause ingest and press Rebuild counters in the overview to take
              the first measurement.
            </EmptyState.Description>
          </EmptyState.Root>
        ) : (
          <Stack direction="column" gap="lg">
            <Text variant="body-sm">
              {`Share of the ${coverage.total.toLocaleString()} catalog rows carrying each optional field, measured ${formatAge(coverage.measuredAt)}. Counted on demand, so it is a snapshot rather than a live number.`}
            </Text>
            <Stack direction="row" gap="xl" wrap="wrap">
              {coverage.fields.map((row) => (
                <Stack
                  key={row.field}
                  direction="column"
                  gap="xs"
                  style={{ minWidth: 140 }}
                >
                  <Text variant="body-sm">
                    {FIELD_LABELS[row.field] ?? row.field}
                  </Text>
                  <Text variant="heading-md">
                    {share(row.count, coverage.total)}
                  </Text>
                  <Text variant="body-sm">{formatCount(row.count)} rows</Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}
      </Card.Content>
    </Card.Root>
  );
}

/** An empty catalog has no coverage rather than 0% coverage, and saying 0%
 * would read as a measurement of something. */
function share(count: number, total: number): string {
  if (total <= 0) return '—';
  return `${((count / total) * 100).toFixed(1)}%`;
}
