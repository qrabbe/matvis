import { useMemo, useState } from 'react';
import { Badge, EmptyState, LinkButton, Stack, Text } from '@wordpress/ui';
import {
  DataViews,
  filterSortAndPaginate,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { CopyButton, InlineSpinner } from '@matvis/ui';
import { CoverageMeter } from '../components/CoverageMeter';
import { SectionCard } from '../components/SectionCard';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { formatKr } from '../lib/format';
import {
  catalogSearchHref,
  groupUnmapped,
  type UnmappedGroup,
} from '../lib/unmapped';

/**
 * What the account keeps buying that nothing can identify.
 *
 * **Read-only.** The old repo's equivalent was 624 lines of search box, live
 * Coop lookup, admin rule creation and mutations; none of that comes across,
 * because creating a mapping is a write and the app has none. What survives is
 * the rollup that made it useful — and today that rollup is the most valuable
 * thing in the app, since `itemGtinMap` starts empty and nothing fills it, so
 * essentially every line lands here.
 *
 * That is also why the global coverage meter lives on this tab: this is the
 * honest measure of how much of the app is real.
 */
const CATALOG_PORTAL_URL = '../catalog';

const FIELDS: Field<UnmappedGroup>[] = [
  {
    id: 'text',
    label: 'Printed text',
    enableHiding: false,
    getValue: ({ item }) => item.text,
    render: ({ item }) => (
      <Stack direction="column" gap="xs" style={{ minWidth: 0 }}>
        <Text variant="body-md">{item.text}</Text>
        <Text variant="body-sm" style={{ opacity: 0.7 }}>
          {item.key}
        </Text>
      </Stack>
    ),
  },
  {
    id: 'count',
    label: 'Times bought',
    getValue: ({ item }) => item.count,
    render: ({ item }) => (
      <Badge intent="informational">{`${item.count}`}</Badge>
    ),
  },
  {
    id: 'spend',
    label: 'Total spend',
    getValue: ({ item }) => item.spend,
    render: ({ item }) => <Text variant="body-sm">{formatKr(item.spend)}</Text>,
  },
  {
    id: 'priceRange',
    label: 'Price range',
    enableSorting: false,
    getValue: ({ item }) => item.maxPrice - item.minPrice,
    render: ({ item }) => (
      <Text variant="body-sm">
        {item.minPrice === item.maxPrice
          ? formatKr(item.minPrice)
          : `${formatKr(item.minPrice)} – ${formatKr(item.maxPrice)}`}
      </Text>
    ),
  },
  {
    id: 'lastSeen',
    label: 'Last seen',
    getValue: ({ item }) => item.lastSeen.getTime(),
    render: ({ item }) => (
      <Text variant="body-sm">{item.lastSeen.toLocaleDateString('sv-SE')}</Text>
    ),
  },
  {
    id: 'lookup',
    label: 'Look up',
    enableSorting: false,
    enableHiding: false,
    getValue: ({ item }) => item.key,
    render: ({ item }) => (
      // A link and a copy button, not a mapping control. The catalog portal's
      // search box is local state and reads no term off the URL, so a "search
      // for this" deep link would land on an empty box — the copy button is what
      // actually makes the round trip work today.
      <Stack direction="row" gap="xs" align="center">
        <CopyButton text={item.text} label="Copy" icon />
        <LinkButton
          href={catalogSearchHref(CATALOG_PORTAL_URL)}
          openInNewTab
          variant="minimal"
          tone="neutral"
          size="small"
        >
          Catalog
        </LinkButton>
      </Stack>
    ),
  },
];

/** Stable empty input for the paginate memo while hydration is still running. */
const EMPTY_GROUPS: UnmappedGroup[] = [];

const DEFAULT_VIEW: View = {
  type: 'table',
  page: 1,
  perPage: 25,
  fields: ['text', 'count', 'spend', 'priceRange', 'lastSeen', 'lookup'],
  sort: { field: 'count', direction: 'desc' },
  layout: {
    styles: {
      count: { align: 'end' },
      spend: { align: 'end' },
      priceRange: { align: 'end' },
    },
  },
};

export function UnmappedPanel({ data }: { data: PurchaseData }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const hydrating = data.hydration.total > data.hydration.done;

  // Nothing below the spinner renders while hydrating, and the grouping runs two
  // regexes and a `toLowerCase` per line — so a cold load's worth of it would be
  // computed and thrown away once per batch of receipts.
  const groups = useMemo(
    () => (hydrating ? EMPTY_GROUPS : groupUnmapped(data.lines)),
    [data.lines, hydrating],
  );

  const { data: rows, paginationInfo } = useMemo(
    () => filterSortAndPaginate(groups, view, FIELDS),
    [groups, view],
  );

  return (
    <Stack direction="column" gap="xl">
      <SectionCard title="Coverage">
        <Stack direction="column" gap="md">
          <CoverageMeter coverage={data.coverage} detail />
          <Text variant="body-sm">
            A receipt line becomes a product only through the store’s text → EAN
            map, which starts empty. Until something fills it, this list is the
            whole picture — and each row is exactly one mapping that would close
            that much of the gap.
          </Text>
        </Stack>
      </SectionCard>

      <SectionCard title="Unmapped items">
        {hydrating ? (
          <InlineSpinner label="Loading line items…" />
        ) : (
          <DataViews
            data={rows}
            fields={FIELDS}
            view={view}
            onChangeView={setView}
            actions={[]}
            paginationInfo={paginationInfo}
            getItemId={(item) => item.key}
            defaultLayouts={{ table: {} }}
            search={false}
            empty={
              <EmptyState.Root>
                <EmptyState.Title>
                  {data.lines.length === 0
                    ? 'No line items yet'
                    : 'Everything is mapped'}
                </EmptyState.Title>
                <EmptyState.Description>
                  {data.lines.length === 0
                    ? 'Receipts have to hydrate before their lines can be grouped.'
                    : 'Every purchased line resolves to a catalog product.'}
                </EmptyState.Description>
              </EmptyState.Root>
            }
          />
        )}
      </SectionCard>
    </Stack>
  );
}
