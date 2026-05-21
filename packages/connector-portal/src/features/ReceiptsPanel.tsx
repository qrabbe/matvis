import { useCallback, useState } from 'react';
import { usePaginatedQuery, useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  Stack,
  Text,
} from '@wordpress/ui';
import { api } from '../lib/convexApi';
import { useDevSubject } from '../lib/devSubject';
import { errMsg, formatAmount, formatPurchasedAt } from '../lib/format';

// Header + item row shapes derived straight from the connector's read API, so
// the UI can't drift from what the server actually returns.
type ReceiptHeader = FunctionReturnType<typeof api.receipts.list>['page'][number];
type ReceiptDetail = NonNullable<FunctionReturnType<typeof api.receipts.getReceipt>>;
type ReceiptItem = ReceiptDetail['items'][number];

export function ReceiptsPanel() {
  const subject = useDevSubject();
  const page = usePaginatedQuery(
    api.receipts.list,
    { subject },
    { initialNumItems: 20 },
  );

  const loading = page.status === 'LoadingFirstPage';
  const empty = !loading && page.results.length === 0;

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Receipts</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          {loading && <Text variant="body-sm">Loading receipts…</Text>}

          {empty && (
            <EmptyState.Root>
              <EmptyState.Title>No receipts yet</EmptyState.Title>
              <EmptyState.Description>
                Link a store and hit “Sync now” — receipts appear here live as
                they land.
              </EmptyState.Description>
            </EmptyState.Root>
          )}

          {page.results.length > 0 && (
            <Stack direction="column" gap="sm">
              {page.results.map((r) => (
                <ReceiptRow key={r._id} header={r} subject={subject} />
              ))}
            </Stack>
          )}

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
            <Text variant="body-sm">Loading more…</Text>
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function ReceiptRow({
  header,
  subject,
}: {
  header: ReceiptHeader;
  subject: string;
}) {
  const convex = useConvex();
  const [items, setItems] = useState<ReceiptItem[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useCallback(async () => {
    if (items) {
      setItems(null);
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      const detail = await convex.query(api.receipts.getReceipt, {
        subject,
        receiptId: header._id,
      });
      setItems(detail?.items ?? []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [convex, subject, header._id, items]);

  const downloadPdf = useCallback(async () => {
    setBusy('pdf');
    setError(null);
    try {
      const url = await convex.query(api.receipts.getPdf, {
        subject,
        receiptId: header._id,
      });
      if (url) window.open(url, '_blank', 'noopener');
      else setError('No PDF stored for this receipt.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [convex, subject, header._id]);

  return (
    <Card.Root>
      <Card.Content>
        <Stack direction="column" gap="sm">
          <Stack
            direction="row"
            gap="md"
            align="center"
            justify="space-between"
            wrap="wrap"
          >
            <Stack direction="column" gap="xs">
              <Text variant="body-md">{header.store.name}</Text>
              <Text variant="body-sm">
                {formatPurchasedAt(header.purchasedAt) ?? header.externalId}
              </Text>
            </Stack>
            <Stack direction="row" gap="sm" align="center" wrap="wrap">
              <Badge intent="informational">
                {formatAmount(header.total, header.currency)}
              </Badge>
              <Button
                variant="outline"
                tone="neutral"
                onClick={preview}
                loading={busy === 'preview'}
              >
                {items ? 'Hide items' : 'Preview items'}
              </Button>
              <Button onClick={downloadPdf} loading={busy === 'pdf'}>
                Download PDF
              </Button>
            </Stack>
          </Stack>

          {error && (
            <Notice.Root intent="error">
              <Notice.Description>{error}</Notice.Description>
            </Notice.Root>
          )}

          {items && <ReceiptItems items={items} header={header} />}
        </Stack>
      </Card.Content>
    </Card.Root>
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
