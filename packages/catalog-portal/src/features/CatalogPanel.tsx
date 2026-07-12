import { useEffect, useMemo, useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import {
  Button,
  Card,
  EmptyState,
  InputControl,
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
import { STORE_LABELS, type ReceiptSource } from '@matvis/shared';
import { InlineSpinner } from '../components/InlineSpinner';
import { api, type CatalogRow } from '../lib/convexApi';

// The `store` value is a slug (`'coop'`); show its brand casing when we know it.
function storeLabel(store: string): string {
  return STORE_LABELS[store as ReceiptSource] ?? store;
}

// Table columns. `getValue` powers DataViews' client-side sort over the loaded
// rows; `render` draws the cell. The real search is server-side (see below), so
// DataViews' own search is disabled.
const FIELDS: Field<CatalogRow>[] = [
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
  fields: ['ean', 'name', 'store', 'date'],
};

/** Search box + table over the clean catalog table. The search box drives the
 * SERVER query (`catalog:search` with `q`), so it covers the whole table rather
 * than just the rows DataViews has loaded. */
export function CatalogPanel() {
  const [q, setQ] = useState('');
  // Debounce so each keystroke doesn't spawn a new subscription.
  const debouncedQ = useDebounced(q, 250);
  const page = usePaginatedQuery(
    api.catalog.search,
    { q: debouncedQ || undefined },
    { initialNumItems: 20 },
  );
  const [view, setView] = useState<View>(DEFAULT_VIEW);

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
          <InputControl
            label="Search"
            placeholder="Search by name…"
            value={q}
            onValueChange={(value) => setQ(value)}
          />
          <DataViews
            data={data}
            fields={FIELDS}
            view={view}
            onChangeView={setView}
            paginationInfo={paginationInfo}
            getItemId={(item) => item._id}
            isLoading={loading}
            defaultLayouts={{ table: {} }}
            search={false}
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
