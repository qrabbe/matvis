import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePaginatedQuery, useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Stack,
  Tabs,
  Text,
} from '@wordpress/ui';
// The receipts list is a `@wordpress/dataviews` table — `@wordpress/ui` has no
// data-grid equivalent, so this is a justified fallback (like `Spinner`). It
// renders in the classic `@wordpress/components` style; its stylesheet is loaded
// once in `main.tsx`.
import {
  DataViews,
  filterSortAndPaginate,
  type Action,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { CopyButton, ErrorNotice, InlineSpinner } from '@matvis/ui';
import { api } from '../lib/convexApi';
import { errMsg, formatAmount, formatPurchasedAt } from '../lib/format';

// Header + item row shapes derived straight from the connector's read API, so
// the UI can't drift from what the server actually returns.
type ReceiptHeader = FunctionReturnType<
  typeof api.receipts.list
>['page'][number];
type ReceiptDetail = NonNullable<
  FunctionReturnType<typeof api.receipts.getReceipt>
>;
type ReceiptItem = ReceiptDetail['items'][number];

/** Table columns. `getValue` powers DataViews' client-side sort/search over the
 * already-loaded rows; `render` draws the cell. */
const FIELDS: Field<ReceiptHeader>[] = [
  {
    id: 'store',
    label: 'Store',
    enableHiding: false,
    getValue: ({ item }) => item.store.name,
    render: ({ item }) => <Text variant="body-md">{item.store.name}</Text>,
  },
  {
    id: 'purchasedAt',
    label: 'Purchased',
    getValue: ({ item }) => item.purchasedAt ?? '',
    render: ({ item }) => (
      <Text variant="body-sm">
        {formatPurchasedAt(item.purchasedAt) ?? item.externalId}
      </Text>
    ),
  },
  {
    id: 'total',
    label: 'Total',
    getValue: ({ item }) => item.total,
    render: ({ item }) => (
      <Badge intent="informational">
        {formatAmount(item.total, item.currency)}
      </Badge>
    ),
  },
];

const DEFAULT_VIEW: View = {
  type: 'table',
  page: 1,
  perPage: 20,
  fields: ['store', 'purchasedAt', 'total'],
  layout: { styles: { total: { align: 'end' } } },
};

/** Receipts for one account. With no `token` the reads are scoped to the login
 * session (the portal's own view). Pass a `token` and the exact same component
 * reads purely through it, the decoupled path a third-party service uses. */
export function ReceiptsPanel({ token }: { token?: string } = {}) {
  // Small first page: a live subscription re-reads its range on any write in it,
  // and every panel mount pays for the page it asks for up front.
  const page = usePaginatedQuery(api.receipts.list, token ? { token } : {}, {
    initialNumItems: 10,
  });
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const loading = page.status === 'LoadingFirstPage';

  // DataViews doesn't fetch — it paginates/sorts whatever we hand it. We feed it
  // the rows loaded so far; "Load more" extends that pool from the server.
  const { data, paginationInfo } = useMemo(
    () => filterSortAndPaginate(page.results, view, FIELDS),
    [page.results, view],
  );

  // A single per-row action opens a modal that switches between the readable
  // item list and the raw JSON (with copy/download).
  const actions = useMemo<Action<ReceiptHeader>[]>(
    () => [
      {
        id: 'view',
        label: 'View purchase',
        isPrimary: true,
        modalHeader: (items) => items[0]?.store.name ?? 'Purchase',
        RenderModal: ({ items }) =>
          items[0] ? <ReceiptModal header={items[0]} token={token} /> : <></>,
      },
    ],
    [token],
  );

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Receipts</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <DataViews
            data={data}
            fields={FIELDS}
            view={view}
            onChangeView={setView}
            actions={actions}
            paginationInfo={paginationInfo}
            getItemId={(item) => item._id}
            isLoading={loading}
            defaultLayouts={{ table: {} }}
            search={false}
            empty={
              <EmptyState.Root>
                <EmptyState.Title>No receipts yet</EmptyState.Title>
                <EmptyState.Description>
                  Link a store and hit “Sync now” — receipts appear here live as
                  they land.
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

/** Modal body for one purchase: a Download-PDF control plus a tab switcher
 * between the readable item list and the raw JSON. The line-item detail is
 * fetched lazily when the modal opens. */
function ReceiptModal({
  header,
  token,
}: {
  header: ReceiptHeader;
  token?: string;
}) {
  const convex = useConvex();
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    convex
      .query(api.receipts.getReceipt, { receiptId: header._id, token })
      .then((d) => {
        if (active) setDetail(d ?? { receipt: header, items: [] });
      })
      .catch((e) => {
        if (active) setLoadError(errMsg(e));
      });
    return () => {
      active = false;
    };
  }, [convex, header, token]);

  const downloadPdf = useCallback(async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const url = await convex.query(api.receipts.getPdf, {
        receiptId: header._id,
        token,
      });
      if (url) window.open(url, '_blank', 'noopener');
      else setPdfError('No PDF stored for this receipt.');
    } catch (e) {
      setPdfError(errMsg(e));
    } finally {
      setPdfBusy(false);
    }
  }, [convex, header._id, token]);

  return (
    <Stack direction="column" gap="md">
      <Stack
        direction="row"
        gap="md"
        justify="space-between"
        align="center"
        wrap="wrap"
      >
        <Text variant="body-sm">
          {formatPurchasedAt(header.purchasedAt) ?? header.externalId}
        </Text>
        <Button onClick={downloadPdf} loading={pdfBusy}>
          Download PDF
        </Button>
      </Stack>

      {(loadError || pdfError) && (
        <ErrorNotice>{loadError ?? pdfError}</ErrorNotice>
      )}

      {detail ? (
        <ReceiptDetailView detail={detail} header={header} />
      ) : (
        !loadError && <InlineSpinner label="Loading items…" />
      )}
    </Stack>
  );
}

/** Expanded receipt: a tab switcher between the human-readable item list and
 * the raw JSON payload. Both tabs render the same already-fetched `detail`. */
function ReceiptDetailView({
  detail,
  header,
}: {
  detail: ReceiptDetail;
  header: ReceiptHeader;
}) {
  return (
    <Tabs.Root defaultValue="items">
      <Tabs.List variant="minimal">
        <Tabs.Tab value="items">Items</Tabs.Tab>
        <Tabs.Tab value="json">JSON</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="items" style={{ paddingTop: 12 }}>
        <ReceiptItems items={detail.items} header={header} />
      </Tabs.Panel>
      <Tabs.Panel value="json" style={{ paddingTop: 12 }}>
        <ReceiptJson detail={detail} header={header} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function ReceiptItems({
  items,
  header,
}: {
  items: ReceiptItem[];
  header: ReceiptHeader;
}) {
  if (items.length === 0) {
    return <Text variant="body-sm">No line items recorded.</Text>;
  }
  return (
    <Stack direction="column" gap="xs">
      {items.map((item) => (
        <Stack
          key={item._id}
          direction="row"
          gap="md"
          justify="space-between"
          align="center"
        >
          <Text variant="body-sm">{item.text}</Text>
          <Badge intent={item.isDiscount ? 'low' : 'none'}>
            {formatAmount(item.price, header.currency)}
          </Badge>
        </Stack>
      ))}
      <Stack direction="row" gap="md" justify="space-between" align="center">
        <Text variant="body-md">Total</Text>
        <Text variant="body-md">
          {formatAmount(header.total, header.currency)}
        </Text>
      </Stack>
      {header.discountsTotal !== undefined && (
        <Stack direction="row" gap="md" justify="space-between" align="center">
          <Text variant="body-sm">Discounts</Text>
          <Text variant="body-sm">
            {formatAmount(header.discountsTotal, header.currency)}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}

/** Raw receipt payload (header + line items) with copy + download controls. */
function ReceiptJson({
  detail,
  header,
}: {
  detail: ReceiptDetail;
  header: ReceiptHeader;
}) {
  const json = useMemo(() => JSON.stringify(detail, null, 2), [detail]);
  const filename = `receipt-${header.externalId ?? header._id}.json`;

  const download = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [json, filename]);

  return (
    <Stack direction="column" gap="sm">
      <Stack direction="row" gap="sm" align="center" justify="end" wrap="wrap">
        <CopyButton text={json} label="Copy JSON" />
        <Button variant="outline" tone="neutral" onClick={download}>
          Download JSON
        </Button>
      </Stack>
      <Text
        variant="body-sm"
        render={
          <pre
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'rgba(127,127,127,0.16)',
              padding: '10px 12px',
              borderRadius: 6,
              margin: 0,
              maxHeight: 320,
              overflow: 'auto',
              whiteSpace: 'pre',
            }}
          />
        }
      >
        {json}
      </Text>
    </Stack>
  );
}
