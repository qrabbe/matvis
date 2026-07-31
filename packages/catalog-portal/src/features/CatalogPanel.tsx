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
// The catalog list is a `@wordpress/dataviews` table — `@wordpress/ui` has no
// data-grid equivalent, so this is a justified fallback (like `Spinner`). Its
// stylesheet is loaded once in `main.tsx`.
import {
  DataViews,
  filterSortAndPaginate,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { STORE_LABELS, type StoreSlug } from '@matvis/shared';
import { InlineSpinner, sizedImageUrl } from '@matvis/ui';
import { href, productPath } from '../lib/route';
import { api, type CatalogRow } from '../lib/convexApi';

// The `store` value is a slug (`'coop'`); show its brand casing when we know it.
function storeLabel(store: string): string {
  return STORE_LABELS[store as StoreSlug] ?? store;
}

/** One `SelectControl` option. The package does not re-export the type, so it
 * is read back off the component's own props rather than restated here. */
type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

/** The "no store filter" option. `SelectControl` selects whole item objects
 * rather than their values, so the null value is the idiomatic "cleared" one. */
const ALL_STORES: SelectItem = { label: 'All stores', value: null };

/** Rendition width asked of the CDN. One size serves both layouts: it covers a
 * grid card at 2x and is still ~40 KB, where the untouched original is ~1 MB. */
const IMAGE_PX = 400;

// Fields. `getValue` powers DataViews' client-side sort over the loaded rows;
// `render` draws the cell. The real search is server-side (see below), so
// DataViews' own search is disabled.
//
// `thumb`, `name` and `brand` are the view's media, title and description
// fields, which DataViews renders together as one primary column in the table
// and as the card in the grid — an image-led grid is what makes this read as a
// catalog rather than a spreadsheet. They are deliberately NOT in `view.fields`,
// which lists only the remaining columns; naming a field in both places renders
// it twice. The media element is left unsized so each layout's own CSS can size
// it.
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

/** Search box + store filter + table/grid over the clean catalog table. The
 * controls drive the SERVER query (`catalog:search`), so they cover the whole
 * table rather than just the rows DataViews has loaded. A digit-only term is
 * routed to the EAN index server-side, so pasting a barcode just works. */
export function CatalogPanel() {
  const [q, setQ] = useState('');
  const [store, setStore] = useState<StoreSlug | null>(null);
  // Debounce so each keystroke doesn't spawn a new subscription.
  const debouncedQ = useDebounced(q, 250);
  const stats = useQuery(api.catalog.stats, {});
  const page = usePaginatedQuery(
    api.catalog.search,
    { q: debouncedQ || undefined, store: store ?? undefined },
    // Small first page: this is a live subscription that re-reads its range on
    // any write in it, and it is remounted on every debounced keystroke.
    // "Load more" costs one extra round trip; a fat first page costs every user.
    { initialNumItems: 10 },
  );
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  // Only offer chains that actually have rows, rather than every reserved slug.
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
  // The control selects item objects, so the selection has to come out of the
  // current array — a new object with the same value would not match.
  const storeSelection =
    storeItems.find((item) => item.value === store) ?? ALL_STORES;

  // DataViews doesn't fetch — it paginates/sorts whatever we hand it. We feed it
  // the rows loaded so far; "Load more" extends that pool from the server.
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
            // A real anchor, so a row can be middle-clicked, opened in a new tab
            // and its link copied — the point of having a deep link at all.
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

// Small local debounce hook (avoid a new dep).
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
