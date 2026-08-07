import { useState, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { Badge, Button, Card, EmptyState, Stack, Text } from '@wordpress/ui';
import {
  STORE_LABELS,
  type CatalogNutrition,
  type CatalogRow,
  type StoreSlug,
} from '@matvis/shared';
import { SkeletonList, sizedImageUrl } from '@matvis/ui';
import { href } from '../lib/route';
import { api } from '../lib/convexApi';

function storeLabel(store: string): string {
  return STORE_LABELS[store as StoreSlug] ?? store;
}

export function ProductDetail({ ean }: { ean: string }) {
  const rows = useQuery(api.catalog.getByEan, { ean });
  const [storeIndex, setStoreIndex] = useState(0);

  if (rows === undefined) {
    return <SkeletonList label="Loading product…" rows={4} rowHeight={32} />;
  }

  const item = rows[storeIndex] ?? rows[0];
  if (!item) {
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

  return (
    <Stack direction="column" gap="lg">
      <BackLink />
      {rows.length > 1 && (
        <Stack direction="row" gap="sm" wrap="wrap" align="center">
          <Text variant="body-sm">Sourced from:</Text>
          {rows.map((row, index) => (
            <Button
              key={row._id}
              size="small"
              variant={index === storeIndex ? 'solid' : 'outline'}
              tone="neutral"
              onClick={() => setStoreIndex(index)}
            >
              {storeLabel(row.store)}
            </Button>
          ))}
        </Stack>
      )}
      <ProductCard item={item} />
      {item.food && <FoodCard food={item.food} />}
      <ProvenanceCard item={item} />
    </Stack>
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
              {item.salesUnit && <Badge intent="none">{item.salesUnit}</Badge>}
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
          {item.packageSize !== undefined && item.packageSizeUnit && (
            <DefinitionRow
              label="Package size"
              value={`${item.packageSize} ${item.packageSizeUnit}`}
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
