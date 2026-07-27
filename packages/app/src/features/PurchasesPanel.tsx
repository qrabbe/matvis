import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConvex } from 'convex/react';
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
// data-grid equivalent, so this is a justified fallback (like `Spinner`). Its
// stylesheet is loaded once in `main.tsx`.
import {
  DataViews,
  filterSortAndPaginate,
  type Action,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { CopyButton } from '../components/CopyButton';
import { ErrorNotice } from '../components/ErrorNotice';
import { InlineSpinner } from '../components/InlineSpinner';
import { ProductThumb } from '../components/ProductThumb';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { api, type ReceiptHeader, type ReceiptItemDoc } from '../lib/convexApi';
import { downloadJson } from '../lib/download';
import { errMsg, formatAmount, formatPurchasedAt } from '../lib/format';
import type { CatalogRow } from '../lib/catalogApi';

/**
 * The receipts table.
 *
 * Deliberately written fresh against the same pattern as
 * `connector-portal`'s `ReceiptsPanel` rather than copied across package
 * boundaries — it reads the same API with the same token argument, so the shape
 * is the same, but 360 lines duplicated between packages would be worse than
 * two implementations that can diverge on purpose. Promoting it into
 * `@matvis/ui` is the DRY move and is noted as a follow-up.
 *
 * What is added over the portal's version: a line item shows its matched
 * product when the EAN resolves, and each receipt carries an "N unmapped" badge.
 */
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
    id: 'itemCount',
    label: 'Items',
    getValue: ({ item }) => item.itemCount ?? 0,
    render: ({ item }) => (
      <Text variant="body-sm">{item.itemCount ?? '—'}</Text>
    ),
  },
  {
    id: 'total',
    label: 'Total',
    getValue: ({ item }) => item.total ?? 0,
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
  fields: ['store', 'purchasedAt', 'itemCount', 'total'],
  layout: { styles: { total: { align: 'end' }, itemCount: { align: 'end' } } },
};

export function PurchasesPanel({
  data,
  token,
}: {
  data: PurchaseData;
  token: string;
}) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  // DataViews does not fetch — it sorts and paginates whatever it is handed.
  // The purchase store has already drained every header page, so the pool here
  // is the account's whole history and "load more" is not a thing the user has
  // to click.
  const { data: rows, paginationInfo } = useMemo(
    () => filterSortAndPaginate(data.headers, view, FIELDS),
    [data.headers, view],
  );

  // Keyed on the two slices the modal actually reads, never on `data` — the
  // store returns a fresh object every render, so a memo on it never hits,
  // `RenderModal` gets a new identity, and React remounts the modal (losing its
  // fetch state and re-issuing `getReceipt`) on every parent render.
  const { itemsByReceipt, lines } = data;
  const actions = useMemo<Action<ReceiptHeader>[]>(
    () => [
      {
        id: 'view',
        label: 'View purchase',
        isPrimary: true,
        modalHeader: (items) => items[0]?.store.name ?? 'Purchase',
        RenderModal: ({ items }) =>
          items[0] ? (
            <ReceiptModal
              header={items[0]}
              token={token}
              itemsByReceipt={itemsByReceipt}
              lines={lines}
            />
          ) : (
            <></>
          ),
      },
    ],
    [itemsByReceipt, lines, token],
  );

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Purchases</Card.Title>
      </Card.Header>
      <Card.Content>
        <DataViews
          data={rows}
          fields={FIELDS}
          view={view}
          onChangeView={setView}
          actions={actions}
          paginationInfo={paginationInfo}
          getItemId={(item) => item._id}
          isLoading={data.loadingHeaders}
          defaultLayouts={{ table: {} }}
          search={false}
          empty={
            <EmptyState.Root>
              <EmptyState.Title>No receipts yet</EmptyState.Title>
              <EmptyState.Description>
                Link a store and sync in the connector portal — receipts appear
                here live as they land.
              </EmptyState.Description>
            </EmptyState.Root>
          }
        />
      </Card.Content>
    </Card.Root>
  );
}

/**
 * One purchase. Items come from the purchase store's cache when they are
 * already there (the common case after first load) and are fetched on demand
 * otherwise, so opening a receipt is instant on a warm cache.
 */
function ReceiptModal({
  header,
  token,
  itemsByReceipt,
  lines,
}: {
  header: ReceiptHeader;
  token: string;
  itemsByReceipt: PurchaseData['itemsByReceipt'];
  lines: PurchaseData['lines'];
}) {
  const convex = useConvex();
  const cached = itemsByReceipt.get(header._id);
  const [fetched, setFetched] = useState<ReceiptItemDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const items = cached ?? fetched;

  // Only runs when hydration has not reached this receipt yet; on a warm cache
  // `cached` is already there and this never fires.
  useEffect(() => {
    if (cached) return;
    let active = true;
    convex
      .query(api.receipts.getReceipt, { receiptId: header._id, token })
      .then((detail) => {
        if (active) setFetched(detail?.items ?? []);
      })
      .catch((e) => {
        if (active) setLoadError(errMsg(e));
      });
    return () => {
      active = false;
    };
  }, [cached, convex, header._id, token]);

  const downloadPdf = useCallback(async () => {
    setPdfBusy(true);
    setLoadError(null);
    try {
      const url = await convex.query(api.receipts.getPdf, {
        receiptId: header._id,
        token,
      });
      if (url) window.open(url, '_blank', 'noopener');
      else setLoadError('No PDF stored for this receipt.');
    } catch (e) {
      setLoadError(errMsg(e));
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
        <Button onClick={() => void downloadPdf()} loading={pdfBusy}>
          Download PDF
        </Button>
      </Stack>

      {loadError && <ErrorNotice>{loadError}</ErrorNotice>}

      {items ? (
        <Tabs.Root defaultValue="items">
          <Tabs.List variant="minimal">
            <Tabs.Tab value="items">Items</Tabs.Tab>
            <Tabs.Tab value="json">JSON</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="items" style={{ paddingTop: 12 }}>
            <ReceiptItems items={items} header={header} lines={lines} />
          </Tabs.Panel>
          <Tabs.Panel value="json" style={{ paddingTop: 12 }}>
            <ReceiptJson items={items} header={header} />
          </Tabs.Panel>
        </Tabs.Root>
      ) : (
        !loadError && <InlineSpinner label="Loading items…" />
      )}
    </Stack>
  );
}

/** The line list, each row showing its matched product where one exists. The
 * "N unmapped" count at the top is the per-receipt slice of what the Unmapped
 * tab totals up. */
function ReceiptItems({
  items,
  header,
  lines,
}: {
  items: ReceiptItemDoc[];
  header: ReceiptHeader;
  lines: PurchaseData['lines'];
}) {
  // Reuse the purchase store's join rather than re-picking a row here, so the
  // product shown on a line is the same one every other tab counted.
  const productByItemId = useMemo(() => {
    const out = new Map<string, CatalogRow>();
    for (const line of lines) {
      if (line.header._id === header._id && line.product) {
        out.set(line.item._id, line.product);
      }
    }
    return out;
  }, [lines, header._id]);

  const productFor = useCallback(
    (item: ReceiptItemDoc): CatalogRow | null =>
      productByItemId.get(item._id) ?? null,
    [productByItemId],
  );

  if (items.length === 0) {
    return <Text variant="body-sm">No line items recorded.</Text>;
  }

  const purchased = items.filter((item) => !item.isDiscount);
  const unmapped = purchased.filter((item) => !productFor(item)).length;

  return (
    <Stack direction="column" gap="sm">
      {unmapped > 0 && (
        <Badge intent="low">
          {`${unmapped} of ${purchased.length} unmapped`}
        </Badge>
      )}

      {items.map((item) => {
        const product = item.isDiscount ? null : productFor(item);
        return (
          <Stack
            key={item._id}
            direction="row"
            gap="md"
            justify="space-between"
            align="center"
          >
            <Stack
              direction="row"
              gap="sm"
              align="center"
              style={{ minWidth: 0 }}
            >
              {!item.isDiscount && <ProductThumb product={product} size={32} />}
              <Stack direction="column" gap="xs" style={{ minWidth: 0 }}>
                <Text variant="body-sm">{item.text}</Text>
                {product && (
                  <Text variant="body-sm" style={{ opacity: 0.7 }}>
                    {product.name}
                  </Text>
                )}
              </Stack>
            </Stack>
            <Badge intent={item.isDiscount ? 'low' : 'none'}>
              {formatAmount(item.price, header.currency)}
            </Badge>
          </Stack>
        );
      })}

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

/** Raw payload (header + line items) with copy and download controls. */
function ReceiptJson({
  items,
  header,
}: {
  items: ReceiptItemDoc[];
  header: ReceiptHeader;
}) {
  const payload = useMemo(() => ({ receipt: header, items }), [header, items]);
  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const filename = `receipt-${header.externalId || header._id}.json`;

  return (
    <Stack direction="column" gap="sm">
      <Stack direction="row" gap="sm" align="center" justify="end" wrap="wrap">
        <CopyButton text={json} label="Copy JSON" />
        <Button
          variant="outline"
          tone="neutral"
          onClick={() => downloadJson(payload, filename)}
        >
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
