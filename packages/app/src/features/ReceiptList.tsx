import { useCallback, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  Stack,
  Text,
} from '@wordpress/ui';
import type { Receipt, ReceiptSummary } from '@matvis/shared';
import { connector } from '../lib/connector';
import { downloadBytes, downloadJson, downloadZip } from '../lib/download';
import { errMsg, formatAmount } from '../lib/format';
import { makeZip, type ZipEntry } from '../lib/zip';

/** Human-readable, collision-free name for a receipt PDF inside the zip. */
function pdfFileName(summary: ReceiptSummary): string {
  const date = summary.purchasedAt?.slice(0, 10);
  return date
    ? `coop-receipt-${date}-${summary.id}.pdf`
    : `coop-receipt-${summary.id}.pdf`;
}

export function ReceiptList({ accessToken }: { accessToken: string }) {
  const [receipts, setReceipts] = useState<ReceiptSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Progress of the "download all PDFs" job: null when idle. */
  const [zipProgress, setZipProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReceipts(await connector.listReceipts(accessToken));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const downloadAllPdfs = useCallback(async () => {
    if (!receipts) return;
    setZipError(null);
    setZipProgress({ done: 0, total: receipts.length });
    try {
      const entries: ZipEntry[] = [];
      // Fetch one at a time to stay gentle on Coop's API.
      for (const summary of receipts) {
        const bytes = await connector.fetchReceiptPdf(accessToken, summary.id);
        entries.push({ name: pdfFileName(summary), bytes });
        setZipProgress({ done: entries.length, total: receipts.length });
      }
      downloadZip(makeZip(entries), 'coop-receipts.zip');
    } catch (e) {
      setZipError(errMsg(e));
    } finally {
      setZipProgress(null);
    }
  }, [accessToken, receipts]);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Receipts</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <Stack direction="row" gap="sm" align="center" wrap="wrap">
            <Button onClick={load} loading={loading}>
              {receipts ? 'Reload receipts' : 'Load receipts'}
            </Button>
            {receipts && receipts.length > 0 && (
              <Button
                variant="outline"
                tone="neutral"
                onClick={() => downloadJson(receipts, 'coop-receipts.json')}
              >
                Download all (JSON)
              </Button>
            )}
            {receipts && receipts.length > 0 && (
              <Button
                variant="outline"
                tone="neutral"
                onClick={downloadAllPdfs}
                loading={zipProgress !== null}
              >
                {zipProgress
                  ? `Downloading ${zipProgress.done}/${zipProgress.total}…`
                  : 'Download all PDFs (zip)'}
              </Button>
            )}
            {receipts && (
              <Text variant="body-sm">
                {receipts.length} receipt{receipts.length === 1 ? '' : 's'}
              </Text>
            )}
          </Stack>

          {error && (
            <Notice.Root intent="error">
              <Notice.Title>Could not load receipts</Notice.Title>
              <Notice.Description>{error}</Notice.Description>
            </Notice.Root>
          )}

          {zipError && (
            <Notice.Root intent="error">
              <Notice.Title>Could not download all PDFs</Notice.Title>
              <Notice.Description>{zipError}</Notice.Description>
            </Notice.Root>
          )}

          {receipts && receipts.length === 0 && (
            <EmptyState.Root>
              <EmptyState.Title>No receipts</EmptyState.Title>
              <EmptyState.Description>
                Your Coop account has no receipts to show.
              </EmptyState.Description>
            </EmptyState.Root>
          )}

          {receipts && receipts.length > 0 && (
            <Stack direction="column" gap="sm">
              {receipts.map((r) => (
                <ReceiptRow key={r.id} summary={r} accessToken={accessToken} />
              ))}
            </Stack>
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

type RowBusy = 'idle' | 'download' | 'preview' | 'json';

function ReceiptRow({
  summary,
  accessToken,
}: {
  summary: ReceiptSummary;
  accessToken: string;
}) {
  const [busy, setBusy] = useState<RowBusy>('idle');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Parse once and cache; both preview and JSON export share the result. */
  const ensureParsed = useCallback(async (): Promise<Receipt> => {
    if (receipt) return receipt;
    const bytes = await connector.fetchReceiptPdf(accessToken, summary.id);
    const parsed = await connector.parseReceipt(bytes);
    setReceipt(parsed);
    return parsed;
  }, [accessToken, summary.id, receipt]);

  const download = useCallback(async () => {
    setBusy('download');
    setError(null);
    try {
      const bytes = await connector.fetchReceiptPdf(accessToken, summary.id);
      downloadBytes(bytes, `coop-receipt-${summary.id}.pdf`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('idle');
    }
  }, [accessToken, summary.id]);

  const preview = useCallback(async () => {
    if (receipt) {
      setReceipt(null);
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      await ensureParsed();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('idle');
    }
  }, [receipt, ensureParsed]);

  const exportJson = useCallback(async () => {
    setBusy('json');
    setError(null);
    try {
      const parsed = await ensureParsed();
      downloadJson(parsed, `coop-receipt-${summary.id}.json`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('idle');
    }
  }, [ensureParsed, summary.id]);

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
              <Text variant="body-md">
                {summary.purchasePlace ?? 'Unknown store'}
              </Text>
              <Text variant="body-sm">
                {summary.purchasedAt
                  ? new Date(summary.purchasedAt).toLocaleString()
                  : summary.id}
              </Text>
            </Stack>
            <Stack direction="row" gap="sm" align="center" wrap="wrap">
              <Badge intent="informational">
                {formatAmount(summary.purchaseAmount)}
              </Badge>
              <Button
                variant="outline"
                tone="neutral"
                onClick={preview}
                loading={busy === 'preview'}
              >
                {receipt ? 'Hide items' : 'Preview items'}
              </Button>
              <Button
                variant="outline"
                tone="neutral"
                onClick={exportJson}
                loading={busy === 'json'}
              >
                Download JSON
              </Button>
              <Button onClick={download} loading={busy === 'download'}>
                Download PDF
              </Button>
            </Stack>
          </Stack>

          {error && (
            <Notice.Root intent="error">
              <Notice.Description>{error}</Notice.Description>
            </Notice.Root>
          )}

          {receipt && <ReceiptItems receipt={receipt} />}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function ReceiptItems({ receipt }: { receipt: Receipt }) {
  return (
    <Stack direction="column" gap="xs">
      {receipt.items.map((item, i) => (
        <Stack
          key={i}
          direction="row"
          gap="md"
          justify="space-between"
          align="center"
        >
          <Text variant="body-sm">{item.text}</Text>
          <Badge intent={item.isDiscount ? 'low' : 'none'}>
            {formatAmount(item.price, receipt.currency)}
          </Badge>
        </Stack>
      ))}
      <Stack direction="row" gap="md" justify="space-between" align="center">
        <Text variant="body-md">Total</Text>
        <Text variant="body-md">
          {formatAmount(receipt.total, receipt.currency)}
        </Text>
      </Stack>
      {receipt.discountsTotal !== undefined && (
        <Stack direction="row" gap="md" justify="space-between" align="center">
          <Text variant="body-sm">Discounts</Text>
          <Text variant="body-sm">
            {formatAmount(receipt.discountsTotal, receipt.currency)}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
