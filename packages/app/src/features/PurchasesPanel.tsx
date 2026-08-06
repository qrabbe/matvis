import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConvex } from 'convex/react';
import { Badge, Button, EmptyState, Stack, Tabs, Text } from '@wordpress/ui';
import {
  DataViews,
  filterSortAndPaginate,
  type Action,
  type Field,
  type View,
} from '@wordpress/dataviews';
import { ErrorNotice, JsonView, SkeletonList } from '@matvis/ui';
import { NoReceipts } from '../components/NoReceipts';
import { ProductThumb } from '../components/ProductThumb';
import { SectionCard } from '../components/SectionCard';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { api } from '../lib/convexApi';
import {
  errMsg,
  formatAmount,
  formatPurchasedAt,
  type CatalogRow,
  type ReceiptHeader,
  type ReceiptItemDoc,
} from '@matvis/shared';

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

  const { data: rows, paginationInfo } = useMemo(
    () => filterSortAndPaginate(data.headers, view, FIELDS),
    [data.headers, view],
  );

  const { itemsByReceipt, linesByReceipt } = data;
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
              lines={linesByReceipt.get(items[0]._id) ?? []}
            />
          ) : (
            <></>
          ),
      },
    ],
    [itemsByReceipt, linesByReceipt, token],
  );

  return (
    <SectionCard title="Purchases">
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
        empty={<NoReceipts />}
      />
    </SectionCard>
  );
}

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
  const payload = useMemo(() => ({ receipt: header, items }), [header, items]);

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
            <JsonView
              value={payload}
              filename={`receipt-${header.externalId || header._id}.json`}
            />
          </Tabs.Panel>
        </Tabs.Root>
      ) : (
        !loadError && <SkeletonList label="Loading items…" rows={5} />
      )}
    </Stack>
  );
}

function ReceiptItems({
  items,
  header,
  lines,
}: {
  items: ReceiptItemDoc[];
  header: ReceiptHeader;
  lines: PurchaseData['lines'];
}) {
  const productByItemId = useMemo(() => {
    const out = new Map<string, CatalogRow>();
    for (const line of lines) {
      if (line.product) out.set(line.item._id, line.product);
    }
    return out;
  }, [lines]);

  const productFor = useCallback(
    (item: ReceiptItemDoc): CatalogRow | null =>
      productByItemId.get(item._id) ?? null,
    [productByItemId],
  );

  if (items.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>No line items</EmptyState.Title>
        <EmptyState.Description>
          This receipt has a total but no itemised lines.
        </EmptyState.Description>
      </EmptyState.Root>
    );
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
