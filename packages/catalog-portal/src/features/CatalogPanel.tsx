import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import {
  Button,
  Card,
  EmptyState,
  InputControl,
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
import { visitorId } from '../lib/visitor';

function storeLabel(store: string): string {
  return STORE_LABELS[store as StoreSlug] ?? store;
}

const IMAGE_PX = 400;

const COLUMNS: Field<CatalogRow>[] = [
  {
    id: 'thumb',
    label: 'Image',
    type: 'media',
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
    // Deliberately `_creationTime` and deliberately labelled "Added". Convex
    // preserves it across a replace, so it means first write and nothing else.
    // Last verified is `fetchedAt`, which is a different column and is absent
    // on every row nothing has re-fetched.
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

/** No column sorts, and the ban is applied here rather than field by field so
 * that a new column cannot quietly bring sorting back.
 *
 * The order is the server's to decide and it is not one order: a name query
 * comes back relevance-ordered from the search index, a digit query is a prefix
 * range and so is EAN-ascending, and an empty query is newest first. None of
 * those can be re-sorted by another field without fetching the whole table.
 * A header sort would only reorder the pages already loaded while presenting
 * itself as having sorted the catalog. */
const FIELDS: Field<CatalogRow>[] = COLUMNS.map((field) => ({
  ...field,
  enableSorting: false,
}));

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
  const debouncedQ = useDebounced(q, 250);
  const page = usePaginatedQuery(
    api.catalog.search,
    { q: debouncedQ || undefined },
    { initialNumItems: 10 },
  );
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  useSearchLog(debouncedQ, page.status, page.results.length);

  // Still needed for the `paginationInfo` DataViews requires, and for hiding
  // columns. With every field's sorting off it has nothing left to reorder.
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
            placeholder="Search by name or EAN…"
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

/** Records a term once it has settled and its first page has arrived.
 *
 * The `logged` ref is the whole correctness story. Without it a re-render, a
 * Load more or a change of view logs the same term again, and the top-terms
 * table ends up measuring scrolling rather than searching. Three things this
 * must not do, each a natural-looking mistake: not once per keystroke (the
 * debounce is there for this), not once per page of results, and not for the
 * empty term, because browsing everything is not a search. */
function useSearchLog(term: string, status: string, resultCount: number): void {
  const logSearch = useMutation(api.search.logSearch);
  const logged = useRef<string | null>(null);

  useEffect(() => {
    if (term === '') return;
    // Wait for a page that actually arrived, or `results` is zero because
    // nothing has loaded rather than because nothing matched.
    if (status === 'LoadingFirstPage') return;
    if (logged.current === term) return;

    logged.current = term;
    // Fired and forgotten. A telemetry write that cannot land must never
    // produce a toast, block the results or retry: the user is looking for a
    // product.
    void logSearch({
      term,
      visitor: visitorId(),
      results: resultCount,
    }).catch(() => {});
  }, [term, status, resultCount, logSearch]);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
