import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  Stack,
  Text,
} from '@wordpress/ui';
import { CoverageMeter } from '../components/CoverageMeter';
import {
  LogConsumption,
  type LoggableProduct,
} from '../components/LogConsumption';
import { ProductThumb } from '../components/ProductThumb';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { StatGrid } from '../components/StatGrid';
import type { Consumption } from '../hooks/useConsumption';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { allocateConsumption, totalConsumedMacros } from '../lib/consumption';
import { spanDays } from '../lib/dateRange';
import { formatGrams, formatKcal, formatKr } from '../lib/format';
import {
  groupPantry,
  LOW_PROTEIN_DAYS,
  pantryStock,
  type PantryGroup,
} from '../lib/pantry';

export function PantryPanel({
  data,
  consumption,
}: {
  data: PurchaseData;
  consumption: Consumption;
}) {
  const allocations = useMemo(
    () => allocateConsumption(data.lines, consumption.events),
    [data.lines, consumption.events],
  );

  const groups = useMemo(
    () => groupPantry(allocations, consumption.excludedEans),
    [allocations, consumption.excludedEans],
  );

  const averageDailyProtein = useMemo(() => {
    if (consumption.events.length === 0) return 0;
    const total = totalConsumedMacros(allocations);
    const days = spanDays(
      consumption.events.map((event) => new Date(event.consumedAt)),
    );
    return days > 0 ? total.protein / days : 0;
  }, [allocations, consumption.events]);

  const stock = useMemo(
    () => pantryStock(groups, averageDailyProtein),
    [averageDailyProtein, groups],
  );

  const products = useMemo<LoggableProduct[]>(() => {
    const byEan = new Map<string, string>();
    for (const line of data.lines) {
      if (line.product && !byEan.has(line.product.ean)) {
        byEan.set(line.product.ean, line.product.name);
      }
    }
    return [...byEan.entries()].map(([ean, name]) => ({ ean, name }));
  }, [data.lines]);

  if (data.coverage.catalogedLines === 0) {
    return (
      <Stack direction="column" gap="xl">
        <ModelNotice />
        <Card.Root>
          <Card.Content>
            <Stack direction="column" gap="md">
              <EmptyState.Root>
                <EmptyState.Title>
                  {data.catalogAvailable
                    ? 'Nothing to group yet'
                    : 'The catalog is not configured'}
                </EmptyState.Title>
                <EmptyState.Description>
                  {data.catalogAvailable ? (
                    <>
                      The pantry groups receipt lines by the product they
                      resolve to, and no line resolves yet — the store’s text →
                      EAN map starts empty. The Unmapped tab lists exactly which
                      products would fill this in, biggest first.
                    </>
                  ) : (
                    <>
                      No line can resolve to a product because
                      VITE_CATALOG_CONVEX_URL is unset, so the app never asks
                      the catalog deployment. Receipts and spending still work;
                      set the variable and reload to bring the product views
                      back.
                    </>
                  )}
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

      {consumption.available && (
        <SectionCard title="Log something you used">
          <LogConsumption
            products={products}
            onLog={consumption.logConsumption}
          />
        </SectionCard>
      )}

      <StatGrid min={160}>
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
          sub="At your own logged rate"
          tone={lowProtein ? 'caution' : 'neutral'}
        />
      </StatGrid>

      {lowProtein && (
        <Notice.Root intent="warning">
          <Notice.Title>Protein is running low</Notice.Title>
          <Notice.Description>
            {`Under ${LOW_PROTEIN_DAYS} days left at the rate you've been logging. This is only as good as what you've marked used.`}
          </Notice.Description>
        </Notice.Root>
      )}

      <SectionCard title="Products">
        <Stack direction="column" gap="md">
          {groups.length === 0 ? (
            <EmptyState.Root>
              <EmptyState.Title>Nothing in the pantry</EmptyState.Title>
              <EmptyState.Description>
                Every resolved purchase has been logged as used, or nothing has
                resolved to a product yet.
              </EmptyState.Description>
            </EmptyState.Root>
          ) : (
            groups.map((group) => (
              <PantryRow
                key={group.ean}
                group={group}
                onLog={consumption.logConsumption}
                onExclude={consumption.setExcluded}
              />
            ))
          )}
        </Stack>
      </SectionCard>

      <SectionCard title="Coverage">
        <CoverageMeter coverage={data.coverage} />
      </SectionCard>
    </Stack>
  );
}

function PantryRow({
  group,
  onLog,
  onExclude,
}: {
  group: PantryGroup;
  onLog: (ean: string, quantity: number, consumedAt: number) => Promise<void>;
  onExclude: (ean: string, excluded: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const first = group.firstPurchase.toLocaleDateString('sv-SE');
  const last = group.lastPurchase.toLocaleDateString('sv-SE');
  const span = first === last ? first : `${first} → ${last}`;

  const markUsed = async () => {
    setBusy(true);
    try {
      await onLog(group.ean, 1, Date.now());
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 1500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="column" gap="xs">
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
            {`${group.outstandingQuantity % 1 === 0 ? group.outstandingQuantity : group.outstandingQuantity.toFixed(2)} left`}
          </Badge>
          {group.outstandingMacros.kcal > 0 ? (
            <Text variant="body-sm">
              {`${formatKcal(group.outstandingMacros.kcal)} · ${formatGrams(group.outstandingMacros.protein)} protein`}
            </Text>
          ) : (
            <Text variant="body-sm" style={{ opacity: 0.7 }}>
              No usable nutrition
            </Text>
          )}
        </Stack>
        {confirmed ? (
          <Badge intent="stable">✓ Marked used</Badge>
        ) : (
          <Button size="compact" loading={busy} onClick={() => void markUsed()}>
            Mark used
          </Button>
        )}
        <Button
          variant="minimal"
          size="compact"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Cancel' : 'Log differently'}
        </Button>
        <Button
          variant="minimal"
          size="compact"
          onClick={() => void onExclude(group.ean, true)}
        >
          Don't track this
        </Button>
      </Stack>
      {expanded && (
        <LogConsumption
          products={[{ ean: group.ean, name: group.name }]}
          initialEan={group.ean}
          onLog={onLog}
          onDone={() => setExpanded(false)}
        />
      )}
    </Stack>
  );
}

function ModelNotice() {
  return (
    <Notice.Root intent="info">
      <Notice.Title>What you've logged, not what's guessed</Notice.Title>
      <Notice.Description>
        A product leaves the pantry only once you've marked it used — the oldest
        purchase of that product first. Nothing observes your fridge; "Mark
        used" is the one input this app asks for.
      </Notice.Description>
    </Notice.Root>
  );
}
