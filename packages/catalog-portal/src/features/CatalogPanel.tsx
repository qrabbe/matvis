import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import {
  Button,
  Card,
  EmptyState,
  InputControl,
  SelectControl,
  Stack,
  Text,
} from '@wordpress/ui';
import {
  DataViews,
  filterSortAndPaginate,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { STORE_LABELS, type CatalogRow, type StoreSlug } from '@matvis/shared';
import { InlineSpinner, sizedImageUrl } from '@matvis/ui';
import { href, productPath } from '../lib/route';
import { api } from '../lib/convexApi';

function storeLabel(store: string): string {
  return STORE_LABELS[store as StoreSlug] ?? store;
}

type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

const ALL_STORES: SelectItem = { label: 'All stores', value: null };

const IMAGE_PX = 400;

const FIELDS: Field<CatalogRow>[] = [
  {
    id: 'thumb',
    label: 'Image',
    type: 'media',
    enableSorting: false,
    enableHiding: false,
    getValue: ({ item }) => item.imageUrl ?? '',
    render: ({ item }) => {
      const src = sizedImageUrl(item.imageUrl, IMAGE_PX);
      if (!src) return null;
      return <img src={src} alt="" loading="lazy" />;
    },
  },
  {
    id: 'ean',
    label: 'EAN',
    getValue: ({ item }) => item.ean,
    render: ({ item }) => <Text variant="body-sm">{item.ean}</Text>,
  },
  {
    id: 'name',
    label: 'Name',
    enableHiding: false,
    getValue: ({ item }) => item.name,
    render: ({ item }) => <Text variant="body-md">{item.name}</Text>,
  },
  {
    id: 'brand',
    label: 'Brand',
    getValue: ({ item }) => item.brand ?? '',
    render: ({ item }) => <Text variant="body-sm">{item.brand ?? '—'}</Text>,
  },
  {
    id: 'packageSizeText',
    label: 'Size',
    getValue: ({ item }) => item.packageSizeText ?? '',
    render: ({ item }) => (
      <Text variant="body-sm">{item.packageSizeText ?? '—'}</Text>
    ),
  },
  {
    id: 'store',
    label: 'Store',
    getValue: ({ item }) => item.store,
    render: ({ item }) => (
      <Text variant="body-sm">{storeLabel(item.store)}</Text>
    ),
  },
  {
    id: 'date',
    label: 'Added',
    getValue: ({ item }) => item._creationTime,
    render: ({ item }) => (
      <Text variant="body-sm">
        {new Date(item._creationTime).toLocaleDateString()}
      </Text>
    ),
  },
];

/** The media, title and description fields must stay out of `fields`, which
 * lists only the remaining columns. A field named in both places renders twice. */
const DEFAULT_VIEW: View = {
  type: 'table',
  page: 1,
  perPage: 20,
  titleField: 'name',
  mediaField: 'thumb',
  descriptionField: 'brand',
  showMedia: true,
  fields: ['ean', 'packageSizeText', 'store', 'date'],
};

export function CatalogPanel() {
  const [q, setQ] = useState('');
  const [store, setStore] = useState<StoreSlug | null>(null);
  const debouncedQ = useDebounced(q, 250);
  const stats = useQuery(api.catalog.stats, {});
  const page = usePaginatedQuery(
    api.catalog.search,
    { q: debouncedQ || undefined, store: store ?? undefined },
    { initialNumItems: 10 },
  );
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const storeItems = useMemo<SelectItem[]>(
    () => [
      ALL_STORES,
      ...(stats?.stores ?? []).map((slug) => ({
        label: storeLabel(slug),
        value: slug,
      })),
    ],
    [stats?.stores],
  );
  // The control selects whole item objects, so the selection has to come out of
  // the current array. A new object with the same value would not match.
  const storeSelection =
    storeItems.find((item) => item.value === store) ?? ALL_STORES;

  const { data, paginationInfo } = useMemo(
    () => filterSortAndPaginate(page.results, view, FIELDS),
    [page.results, view],
  );
  const loading = page.status === 'LoadingFirstPage';

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Catalog</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '1 1 260px' }}>
              <InputControl
                label="Search"
                placeholder="Search by name or EAN…"
                value={q}
                onValueChange={(value) => setQ(value)}
              />
            </div>
            <div style={{ flex: '0 1 180px' }}>
              <SelectControl
                label="Store"
                items={storeItems}
                value={storeSelection}
                onValueChange={(item) =>
                  setStore((item?.value as StoreSlug | null) ?? null)
                }
              />
            </div>
          </Stack>
          <DataViews
            data={data}
            fields={FIELDS}
            view={view}
            onChangeView={setView}
            paginationInfo={paginationInfo}
            getItemId={(item) => item._id}
            isLoading={loading}
            defaultLayouts={{ table: {}, grid: {} }}
            search={false}
            renderItemLink={({ item, ...props }) => (
              <a {...props} href={href(productPath(item.ean))} />
            )}
            empty={
              <EmptyState.Root>
                <EmptyState.Title>No products</EmptyState.Title>
                <EmptyState.Description>
                  Nothing matched. Try a different search.
                </EmptyState.Description>
              </EmptyState.Root>
            }
          />
          {page.status === 'CanLoadMore' && (
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => page.loadMore(20)}
            >
              Load more
            </Button>
          )}
          {page.status === 'LoadingMore' && (
            <InlineSpinner label="Loading more…" />
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
