import type { ReactNode } from 'react';
import { Badge, Card, Stack, Text } from '@wordpress/ui';
import { CATALOG_SCHEMA_VERSION } from '@matvis/shared';

// Hand-written v1 docs. The field table below mirrors `CatalogItem` in
// packages/shared/src/catalog.ts — keep the two in sync when the contract moves
// (its `CATALOG_SCHEMA_VERSION` is imported live so the header can never lie).
// This is the clean, store-agnostic contract only; the raw per-chain product
// tables behind it are NOT exposed here.

type Field = { name: string; type: string; note: string };

const CATALOG_FIELDS: Field[] = [
  { name: 'ean', type: 'string', note: 'GTIN/EAN, the cross-system join key.' },
  { name: 'name', type: 'string', note: 'Product display name.' },
  {
    name: 'store',
    type: 'ReceiptSource',
    note: 'Store chain the entry was sourced from, e.g. "coop".',
  },
  {
    name: 'sourceTable',
    type: 'string',
    note: 'Raw table the clean row was projected from, e.g. "raw_coop".',
  },
  {
    name: 'sourceId',
    type: 'string',
    note: 'Id of the backing raw row, as a string.',
  },
  {
    name: '_id',
    type: 'Id<"catalog">',
    note: 'Convex document id (system field).',
  },
  {
    name: '_creationTime',
    type: 'number',
    note: 'Epoch ms the row was created (system field).',
  },
];

type Endpoint = { sig: string; desc: string };

const READ_ENDPOINTS: Endpoint[] = [
  {
    sig: 'catalog.search({ q?, paginationOpts })',
    desc: 'Reactive, paginated catalog rows. Empty `q` returns newest-first; a non-empty `q` runs the full-text name search (relevance-ordered).',
  },
  {
    sig: 'catalog.stats()',
    desc: 'Cheap totals for the header — the maintained catalog count.',
  },
];

export function DevPortal() {
  return (
    <Stack direction="column" gap="xl">
      <Card.Root>
        <Card.Header>
          <Card.Title>
            <Stack direction="row" gap="sm" align="center">
              <span>The Catalog contract</span>
              <Badge intent="informational">{`v${CATALOG_SCHEMA_VERSION}`}</Badge>
            </Stack>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Every catalog entry is normalized to this EAN-keyed,
              store-agnostic shape (source:{' '}
              <Code>packages/shared/src/catalog.ts</Code>). The raw per-chain
              product data behind it is not part of this contract.
            </Text>
            <Stack direction="column" gap="xs">
              {CATALOG_FIELDS.map((f) => (
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
          <Card.Title>Read endpoints</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              The catalog is a public, read-only Convex API — no account, no
              auth. Point a Convex client at the deployment and read:
            </Text>
            {READ_ENDPOINTS.map((e) => (
              <Stack key={e.sig} direction="column" gap="xs">
                <Stack direction="row" gap="sm" align="center" wrap="wrap">
                  <Code>{e.sig}</Code>
                  <Badge intent="stable">live</Badge>
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
