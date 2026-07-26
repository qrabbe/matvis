import { useMemo } from 'react';
import { Badge, Card, EmptyState, Notice, Stack, Text } from '@wordpress/ui';
import { CoverageMeter } from '../components/CoverageMeter';
import { ProductThumb } from '../components/ProductThumb';
import { StatCard } from '../components/StatCard';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { formatGrams, formatKcal, formatKr } from '../lib/format';
import {
  CONSUMPTION_WINDOW_DAYS,
  addMacros,
  ZERO_MACROS,
} from '../lib/nutrition';
import {
  groupPantry,
  LOW_PROTEIN_DAYS,
  pantryStock,
  type PantryGroup,
} from '../lib/pantry';

/**
 * What is bought and, under the spreading model, not yet notionally consumed.
 *
 * There is no "Mark used" button — that was the write. Ticket 17 covers bringing
 * real consumption tracking back; until then the pantry is an inference from
 * purchase dates, and the tab says so.
 *
 * Rows are cards rather than a data grid: each is image-led with mixed content,
 * and forcing that into a table loses more than the sorting gains.
 */
export function PantryPanel({ data }: { data: PurchaseData }) {
  const groups = useMemo(() => groupPantry(data.lines), [data.lines]);

  // The account's own average daily protein over the window, which is what
  // makes "protein days" answer a real question — how long the shelf lasts at
  // the rate this household actually buys, not at a recommended rate.
  const averageDailyProtein = useMemo(() => {
    let total = ZERO_MACROS;
    for (const line of data.lines) {
      if (line.macros) total = addMacros(total, line.macros);
    }
    const days = spanDays(data.lines.map((line) => line.purchasedAt));
    return days > 0 ? total.protein / days : 0;
  }, [data.lines]);

  const stock = useMemo(
    () => pantryStock(groups, averageDailyProtein),
    [averageDailyProtein, groups],
  );

  if (data.coverage.catalogedLines === 0) {
    return (
      <Stack direction="column" gap="xl">
        <ModelNotice />
        <Card.Root>
          <Card.Content>
            <Stack direction="column" gap="md">
              <EmptyState.Root>
                <EmptyState.Title>Nothing to group yet</EmptyState.Title>
                <EmptyState.Description>
                  The pantry groups receipt lines by the product they resolve
                  to, and no line resolves yet — the store’s text → EAN map
                  starts empty. The Unmapped tab lists exactly which products
                  would fill this in, biggest first.
                </EmptyState.Description>
              </EmptyState.Root>
              <CoverageMeter coverage={data.coverage} />
            </Stack>
          </Card.Content>
        </Card.Root>
      </Stack>
    );
  }

  const lowProtein =
    stock.proteinDays !== null && stock.proteinDays < LOW_PROTEIN_DAYS;

  return (
    <Stack direction="column" gap="xl">
      <ModelNotice />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <StatCard
          label="Products on the shelf"
          value={stock.products.toLocaleString('sv-SE')}
        />
        <StatCard label="Energy left" value={formatKcal(stock.macros.kcal)} />
        <StatCard
          label="Protein left"
          value={formatGrams(stock.macros.protein)}
        />
        <StatCard label="Fat left" value={formatGrams(stock.macros.fat)} />
        <StatCard label="Carbs left" value={formatGrams(stock.macros.carbs)} />
        <StatCard
          label="Protein days"
          value={
            stock.proteinDays === null
              ? '—'
              : `${stock.proteinDays.toFixed(1)} d`
          }
          sub="At your own average daily rate"
          tone={lowProtein ? 'caution' : 'neutral'}
        />
      </div>

      {lowProtein && (
        <Notice.Root intent="warning">
          <Notice.Title>Protein is running low</Notice.Title>
          <Notice.Description>
            {`Under ${LOW_PROTEIN_DAYS} days left at the rate you normally buy. This is an inference from purchase dates, not a measurement of what is in your fridge.`}
          </Notice.Description>
        </Notice.Root>
      )}

      <Card.Root>
        <Card.Header>
          <Card.Title>Products</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            {groups.length === 0 ? (
              <Text variant="body-sm">Nothing grouped yet.</Text>
            ) : (
              groups.map((group) => <PantryRow key={group.ean} group={group} />)
            )}
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Coverage</Card.Title>
        </Card.Header>
        <Card.Content>
          <CoverageMeter coverage={data.coverage} />
        </Card.Content>
      </Card.Root>
    </Stack>
  );
}

/** One product: image, name, purchase span, unit count, macros. */
function PantryRow({ group }: { group: PantryGroup }) {
  const first = group.firstPurchase.toLocaleDateString('sv-SE');
  const last = group.lastPurchase.toLocaleDateString('sv-SE');
  const span = first === last ? first : `${first} → ${last}`;
  const remaining = Math.round(group.remainingFraction * 100);

  return (
    <Stack direction="row" gap="md" align="center" wrap="wrap">
      <ProductThumb product={group.product} size={48} />
      <Stack
        direction="column"
        gap="xs"
        style={{ flex: '1 1 220px', minWidth: 0 }}
      >
        <Text variant="body-md">{group.name}</Text>
        <Text variant="body-sm" style={{ opacity: 0.7 }}>
          {`${span} · ${formatKr(group.spend)}`}
        </Text>
      </Stack>
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Badge intent="informational">
          {`${group.unitsBought % 1 === 0 ? group.unitsBought : group.unitsBought.toFixed(2)} bought`}
        </Badge>
        {remaining > 0 && <Badge intent="stable">{`${remaining}% left`}</Badge>}
        {group.totalMacros ? (
          <Text variant="body-sm">
            {`${formatKcal(group.totalMacros.kcal)} · ${formatGrams(group.totalMacros.protein)} protein`}
          </Text>
        ) : (
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            No usable nutrition
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

/** Days between the earliest and latest date in a set, at least 1. */
function spanDays(dates: readonly Date[]): number {
  if (dates.length === 0) return 0;
  let min = dates[0]!.getTime();
  let max = min;
  for (const date of dates) {
    const time = date.getTime();
    if (time < min) min = time;
    if (time > max) max = time;
  }
  return Math.max(1, Math.round((max - min) / 86_400_000) + 1);
}

/** States the model on the tab itself — "in the pantry" is an inference from
 * purchase dates, never an observation. */
function ModelNotice() {
  return (
    <Notice.Root intent="info">
      <Notice.Title>Inferred from purchases, not tracked</Notice.Title>
      <Notice.Description>
        {`A purchase is treated as consumed evenly over ${CONSUMPTION_WINDOW_DAYS} days, so "left" means "bought recently enough that some should remain". Nothing here observes your fridge, and there is no way to mark an item used — that would be a write, and the app has read access only.`}
      </Notice.Description>
    </Notice.Root>
  );
}
