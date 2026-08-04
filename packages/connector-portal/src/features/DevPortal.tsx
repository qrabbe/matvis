import type { ReactNode } from 'react';
import { Badge, Card, Stack, Text } from '@wordpress/ui';
import { CopyButton } from '@matvis/ui';

// Hand-written docs. The field table below mirrors `Receipt` in
// packages/shared/src/receipt.ts — keep the two in sync when the contract moves.

type Field = { name: string; type: string; note: string };

const RECEIPT_FIELDS: Field[] = [
  {
    name: 'schemaVersion',
    type: 'number',
    note: 'Contract version stored on every receipt.',
  },
  {
    name: 'source',
    type: 'StoreSlug',
    note: 'Which connector produced it, e.g. "coop".',
  },
  {
    name: 'store',
    type: 'Store',
    note: 'name + optional city/postalCode/phone/orgNr/legalEntity.',
  },
  { name: 'receiptNumber', type: 'string?', note: 'Kvitto number as printed.' },
  {
    name: 'purchasedAt',
    type: 'string?',
    note: 'ISO 8601 purchase timestamp when parseable.',
  },
  { name: 'currency', type: 'string', note: 'ISO 4217, "SEK" for Coop.' },
  { name: 'total', type: 'number?', note: 'Grand total ("Total SEK").' },
  {
    name: 'itemCount',
    type: 'number?',
    note: 'Article count as printed (excludes discounts).',
  },
  {
    name: 'discountsTotal',
    type: 'number?',
    note: 'Sum of discounts ("Erhållna rabatter").',
  },
  { name: 'pointsAmount', type: 'number?', note: 'Points-earning amount.' },
  {
    name: 'vat',
    type: 'VatLine[]',
    note: 'rate/vat/net/gross rows of the Moms table.',
  },
  {
    name: 'items',
    type: 'LineItem[]',
    note: 'text + price (+ optional quantity/unit/gtin).',
  },
  {
    name: 'loyaltyCardId',
    type: 'string?',
    note: 'Membership card number. Personal data.',
  },
];

type Endpoint = { sig: string; desc: string; live: boolean };

const READ_ENDPOINTS: Endpoint[] = [
  {
    sig: 'receipts.list({ paginationOpts })',
    desc: 'Reactive, paginated receipt headers, newest first. Re-runs live as a sync inserts rows.',
    live: true,
  },
  {
    sig: 'receipts.getReceipt({ receiptId })',
    desc: 'One header + its line items, or null if missing / owned by another account.',
    live: true,
  },
  {
    sig: 'receipts.getPdf({ receiptId })',
    desc: 'Signed URL for the stored PDF (fetch the bytes directly), or null.',
    live: true,
  },
  {
    sig: 'receipts.changes({ since, limit? })',
    desc: 'Incremental cursor-pull: pass the previous `cursor` back as `since` for new receipts. `since: 0` backfills from the start. Reactive too.',
    live: true,
  },
  {
    sig: 'webhooks / push subscriptions',
    desc: 'Server-push on new receipts. Planned — poll `changes` (or subscribe to the reactive query) for now.',
    live: false,
  },
];

export function DevPortal() {
  return (
    <Stack direction="column" gap="xl">
      <Card.Root>
        <Card.Header>
          <Card.Title>The Receipt contract</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Every stored receipt is normalized to this store-agnostic shape
              (source: <Code>packages/shared/src/receipt.ts</Code>). Fields only
              some stores print are optional (marked <Code>?</Code>).
            </Text>
            <Stack direction="column" gap="xs">
              {RECEIPT_FIELDS.map((f) => (
                <Stack
                  key={f.name}
                  direction="row"
                  gap="md"
                  align="baseline"
                  wrap="wrap"
                >
                  <Code>{f.name}</Code>
                  <Badge intent="none">{f.type}</Badge>
                  <Text variant="body-sm">{f.note}</Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Getting an account</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              You&rsquo;re signed in with GitHub — the connector is its own
              identity authority, and your login resolves to a connector{' '}
              <Code>account</Code> that scopes every read and store link. The
              endpoints below infer that account from your session.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Read &amp; subscribe endpoints</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            {READ_ENDPOINTS.map((e) => (
              <Stack key={e.sig} direction="column" gap="xs">
                <Stack direction="row" gap="sm" align="center" wrap="wrap">
                  <Code>{e.sig}</Code>
                  <Badge intent={e.live ? 'stable' : 'high'}>
                    {e.live ? 'live' : 'planned'}
                  </Badge>
                  <CopyButton text={e.sig} label="Copy" />
                </Stack>
                <Text variant="body-sm">{e.desc}</Text>
              </Stack>
            ))}
          </Stack>
        </Card.Content>
      </Card.Root>
    </Stack>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <Text
      variant="body-sm"
      render={
        <code
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            background: 'rgba(127,127,127,0.16)',
            padding: '1px 5px',
            borderRadius: 4,
          }}
        />
      }
    >
      {children}
    </Text>
  );
}
