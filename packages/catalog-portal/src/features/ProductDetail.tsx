import { useState, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { Badge, Card, EmptyState, Stack, Tabs, Text } from '@wordpress/ui';
import {
  STORE_LABELS,
  type CatalogNutrition,
  type CatalogRow,
  type SoldBy,
  type StoreSlug,
} from '@matvis/shared';
import { SkeletonList, sizedImageUrl } from '@matvis/ui';
import { href } from '../lib/route';
import { api } from '../lib/convexApi';

function storeLabel(store: string): string {
  return STORE_LABELS[store as StoreSlug] ?? store;
}

/** The contract is canonical, the badge is Swedish, and the page is Swedish. */
const SOLD_BY_LABELS: Record<SoldBy, string> = {
  piece: 'Styck',
  weight: 'Vikt',
};

function soldByLabel(soldBy: SoldBy): string {
  return SOLD_BY_LABELS[soldBy];
}

export function ProductDetail({ ean }: { ean: string }) {
  const rows = useQuery(api.catalog.getByEan, { ean });
  // Kept as a store slug rather than a row index: the route swaps `ean` under a
  // mounted component, so a position selected on one product would carry over
  // and address a different store on the next one.
  const [pickedStore, setPickedStore] = useState<string | null>(null);

  if (rows === undefined) {
    return <SkeletonList label="Loading product…" rows={4} rowHeight={32} />;
  }

  const first = rows[0];
  if (!first) {
    return (
      <Stack direction="column" gap="lg">
        <BackLink />
        <EmptyState.Root>
          <EmptyState.Title>Not in the catalog</EmptyState.Title>
          <EmptyState.Description>
            Nothing is catalogued under EAN {ean}.
          </EmptyState.Description>
        </EmptyState.Root>
      </Stack>
    );
  }

  if (rows.length === 1) {
    return (
      <Stack direction="column" gap="lg">
        <BackLink />
        <StoreCards item={first} />
      </Stack>
    );
  }

  const shownStore = rows.some((row) => row.store === pickedStore)
    ? pickedStore
    : first.store;

  return (
    <Stack direction="column" gap="lg">
      <BackLink />
      <Tabs.Root
        value={shownStore}
        onValueChange={(value) => setPickedStore(String(value))}
      >
        <Stack direction="row" gap="sm" wrap="wrap" align="center">
          <Text variant="body-sm">Sourced from:</Text>
          <Tabs.List>
            {rows.map((row) => (
              <Tabs.Tab key={row._id} value={row.store}>
                {storeLabel(row.store)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Stack>
        {rows.map((row) => (
          <Tabs.Panel key={row._id} value={row.store}>
            <Stack direction="column" gap="lg" style={{ paddingTop: 20 }}>
              <StoreCards item={row} />
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </Stack>
  );
}

function StoreCards({ item }: { item: CatalogRow }) {
  return (
    <>
      <ProductCard item={item} />
      {item.food && <FoodCard food={item.food} />}
      <ProvenanceCard item={item} />
    </>
  );
}

function BackLink() {
  return (
    <Text
      variant="body-sm"
      render={<a href={href('/')} style={{ color: 'inherit' }} />}
    >
      &larr; Back to the catalog
    </Text>
  );
}

function ProductCard({ item }: { item: CatalogRow }) {
  const image = sizedImageUrl(item.imageUrl, 600);
  return (
    <Card.Root>
      <Card.Content>
        <Stack direction="row" gap="xl" wrap="wrap" align="start">
          {image ? (
            <img
              src={image}
              alt=""
              width={220}
              style={{
                width: 220,
                maxWidth: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'contain',
                background: 'rgba(127,127,127,0.10)',
                borderRadius: 8,
              }}
            />
          ) : (
            <NoImage size={220} />
          )}
          <Stack
            direction="column"
            gap="md"
            style={{ flex: '1 1 320px', minWidth: 260 }}
          >
            <Stack direction="column" gap="xs">
              {item.categoryPath && item.categoryPath.length > 0 && (
                <Text variant="body-sm">{item.categoryPath.join(' › ')}</Text>
              )}
              <Text variant="heading-lg">{item.name}</Text>
              {item.brand && <Text variant="body-md">{item.brand}</Text>}
            </Stack>

            <Stack direction="row" gap="sm" wrap="wrap" align="center">
              <Badge intent="none">{storeLabel(item.store)}</Badge>
              {item.packageSizeText && (
                <Badge intent="none">{item.packageSizeText}</Badge>
              )}
              {item.soldBy && (
                <Badge intent="none">{soldByLabel(item.soldBy)}</Badge>
              )}
            </Stack>

            {item.description && (
              <Text variant="body-md">{item.description}</Text>
            )}

            {item.countryOfOrigin && (
              <DefinitionRow label="Ursprung" value={item.countryOfOrigin} />
            )}

            {item.labels && item.labels.length > 0 && (
              <Stack direction="column" gap="xs">
                <Text variant="body-sm">
                  <strong>Märkningar</strong>
                </Text>
                <Stack direction="row" gap="sm" wrap="wrap">
                  {item.labels.map((label) => (
                    <Badge key={label} intent="informational">
                      {label}
                    </Badge>
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function FoodCard({ food }: { food: NonNullable<CatalogRow['food']> }) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Innehåll</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          {food.ingredients && (
            <Stack direction="column" gap="xs">
              <Text variant="body-sm">
                <strong>Ingredienser</strong>
              </Text>
              <Text variant="body-md">{food.ingredients}</Text>
            </Stack>
          )}
          {food.nutrition && <NutritionTable nutrition={food.nutrition} />}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

const NUTRITION_ROWS: {
  key: Exclude<keyof CatalogNutrition, 'basisQuantity' | 'basisUnit'>;
  label: string;
  unit: string;
  indent?: boolean;
}[] = [
  { key: 'energyKj', label: 'Energi', unit: 'kJ' },
  { key: 'energyKcal', label: 'Energi', unit: 'kcal' },
  { key: 'fatG', label: 'Fett', unit: 'g' },
  { key: 'saturatedFatG', label: 'varav mättat fett', unit: 'g', indent: true },
  { key: 'carbohydrateG', label: 'Kolhydrat', unit: 'g' },
  { key: 'sugarsG', label: 'varav sockerarter', unit: 'g', indent: true },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'saltG', label: 'Salt', unit: 'g' },
];

function NutritionTable({ nutrition }: { nutrition: CatalogNutrition }) {
  const rows = NUTRITION_ROWS.filter(
    (row) => nutrition[row.key] !== undefined,
  ).map((row) => ({ ...row, value: nutrition[row.key] as number }));
  if (rows.length === 0) return null;

  return (
    <Stack direction="column" gap="xs">
      <Text variant="body-sm">
        <strong>
          Näringsvärde per {nutrition.basisQuantity} {nutrition.basisUnit}
        </strong>
      </Text>
      <Stack direction="column" gap="xs" style={{ maxWidth: 420 }}>
        {rows.map((row) => (
          <Stack
            key={`${row.key}`}
            direction="row"
            gap="md"
            align="baseline"
            justify="space-between"
          >
            <Text variant="body-sm">
              {row.indent ? `— ${row.label}` : row.label}
            </Text>
            <Text variant="body-sm">
              {row.value} {row.unit}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function ProvenanceCard({ item }: { item: CatalogRow }) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Data</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="xs">
          <DefinitionRow label="EAN" value={item.ean} />
          <DefinitionRow label="Store" value={storeLabel(item.store)} />
          {item.netContent && (
            <DefinitionRow
              label="Net content"
              value={`${item.netContent.value} ${item.netContent.unit}`}
            />
          )}
          <DefinitionRow
            label="Added"
            value={new Date(item._creationTime).toLocaleDateString()}
          />
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function DefinitionRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack direction="row" gap="md" align="baseline" wrap="wrap">
      <Text variant="body-sm" style={{ minWidth: 110 }}>
        <strong>{label}</strong>
      </Text>
      <Text variant="body-sm">{value}</Text>
    </Stack>
  );
}

function NoImage({ size }: { size: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        background: 'rgba(127,127,127,0.10)',
        borderRadius: 8,
      }}
    />
  );
}
