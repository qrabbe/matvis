import { useState, type ReactNode } from 'react';
import { useConvex } from 'convex/react';
import {
  Badge,
  Button,
  Card,
  CollapsibleCard,
  InputControl,
  SelectControl,
  Stack,
  Text,
} from '@wordpress/ui';
import { CopyButton, ErrorNotice, InlineSpinner, JsonView } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { MODELS, type Model, type ModelField } from '../lib/contract';

// Only the chains actually catalogued today. `store` itself accepts any of
// @matvis/shared's full STORES list — this is a shortcut for the two that
// have rows, not the whole contract.
const DEV_PORTAL_STORES = ['coop', 'ica'] as const;
type DevPortalStore = (typeof DEV_PORTAL_STORES)[number];

function baseUrl(convexUrl: string): string {
  return convexUrl.replace(/\.convex\.cloud$/, '.convex.site');
}

export function DevPortal() {
  const base = baseUrl(useConvex().url);
  return (
    <Stack direction="column" gap="xl">
      <Card.Root>
        <Card.Header>
          <Card.Title>The Catalog contract</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Two read-only endpoints. No key and no account. Both answer with a
              JSON array of products.
            </Text>
            <CodeBlock text={base} />
          </Stack>
        </Card.Content>
      </Card.Root>

      <EndpointCard
        title="EAN → product"
        pathLabel="GET /product?ean=…&store=…"
        endpointPath="/product"
        queryParam="ean"
        queryParamNote="Required. The barcode."
        example="7310865078216"
        fileName="catalog-product.json"
        defaultOpen
      />

      <EndpointCard
        title="Text → top 10 products"
        pathLabel="GET /search?q=…&store=…"
        endpointPath="/search"
        queryParam="q"
        queryParamNote="Required. Six or more digits matches an EAN prefix; anything else runs the name search."
        example="kaffe"
        fileName="catalog-search.json"
      />

      <ProductFieldsCard />
    </Stack>
  );
}

const STORE_PARAM_NOTE =
  'Optional: coop, ica … Leave it out for every chain that carries it.';

type SelectItem = { label: string; value: DevPortalStore | null };

const ANY_STORE: SelectItem = { label: 'Any', value: null };

const STORE_ITEMS: SelectItem[] = [
  ANY_STORE,
  ...DEV_PORTAL_STORES.map((store) => ({
    label: STORE_LABELS[store],
    value: store,
  })),
];

type CallState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; value: unknown }
  | { status: 'failed'; message: string };

function EndpointCard({
  title,
  pathLabel,
  endpointPath,
  queryParam,
  queryParamNote,
  example,
  fileName,
  defaultOpen,
}: {
  title: string;
  pathLabel: string;
  endpointPath: '/product' | '/search';
  queryParam: 'ean' | 'q';
  queryParamNote: string;
  example: string;
  fileName: string;
  defaultOpen?: boolean;
}) {
  const base = baseUrl(useConvex().url);
  const [term, setTerm] = useState(example);
  const [store, setStore] = useState<DevPortalStore | null>(null);
  const [requestUrl, setRequestUrl] = useState<string | null>(null);
  const [state, setState] = useState<CallState>({ status: 'idle' });

  function buildUrl(): string {
    const params = new URLSearchParams({ [queryParam]: term });
    if (store) params.set('store', store);
    return `${base}${endpointPath}?${params.toString()}`;
  }

  async function run() {
    const url = buildUrl();
    setRequestUrl(url);
    setState({ status: 'running' });
    try {
      const response = await fetch(url);
      const value: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof value === 'object' &&
          value !== null &&
          typeof (value as { error?: unknown }).error === 'string'
            ? (value as { error: string }).error
            : `HTTP ${response.status}`;
        setState({ status: 'failed', message });
        return;
      }
      setState({ status: 'done', value });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <CollapsibleCard.Root defaultOpen={defaultOpen}>
      <CollapsibleCard.Header>
        <Stack
          direction="row"
          gap="sm"
          align="center"
          justify="space-between"
          wrap="wrap"
        >
          <Text variant="heading-sm">{title}</Text>
          <CollapsibleCard.HeaderDescription>
            <Code>{pathLabel}</Code>
          </CollapsibleCard.HeaderDescription>
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="md" style={{ paddingTop: 12 }}>
          <Stack direction="column" gap="xs">
            <ParamRow name={queryParam} note={queryParamNote} />
            <ParamRow name="store" note={STORE_PARAM_NOTE} />
          </Stack>
          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '1 1 220px' }}>
              <InputControl
                label={queryParam}
                value={term}
                onValueChange={setTerm}
              />
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <SelectControl
                label="store"
                items={STORE_ITEMS}
                value={
                  STORE_ITEMS.find((item) => item.value === store) ?? ANY_STORE
                }
                onValueChange={(item) =>
                  setStore((item?.value ?? null) as DevPortalStore | null)
                }
              />
            </div>
            <Button onClick={run} disabled={state.status === 'running'}>
              Run
            </Button>
          </Stack>
          {state.status === 'running' && <InlineSpinner label="Calling…" />}
          {requestUrl && <Code>{`GET ${requestUrl}`}</Code>}
          {state.status === 'failed' && (
            <ErrorNotice>{state.message}</ErrorNotice>
          )}
          {state.status === 'done' && (
            <JsonView value={state.value} filename={fileName} />
          )}
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function ParamRow({ name, note }: { name: string; note: string }) {
  return (
    <Stack direction="row" gap="md" align="baseline" wrap="wrap">
      <Code>{name}</Code>
      <Text variant="body-sm">{note}</Text>
    </Stack>
  );
}

/** Everything optional is present here. Most rows carry a fraction of it. */
const EXAMPLE_ROW = `{
  "ean": "7311312009203",
  "name": "Sås Tikka Masala",
  "store": "coop",
  "brand": "Santa Maria",
  "imageUrl": "https://res.cloudinary.com/.../f_auto,q_auto/tikka.jpg",
  "netContent": { "value": 360, "unit": "g" },
  "packageSizeText": "360g",
  "soldBy": "piece",
  "categoryPath": ["Skafferi", "Mat & Sås", "Indiskt"],
  "countryOfOrigin": "Sverige",
  "labels": ["Nyckelhålet"],
  "food": {
    "ingredients": "Vatten, tomatpuré, grädde, lök, ...",
    "nutrition": {
      "basisQuantity": 100,
      "basisUnit": "g",
      "energyKcal": 109,
      "fatG": 7.4,
      "proteinG": 1.6,
      "saltG": 0.9
    }
  },
  "fetchedAt": 1754697600000
}`;

function ProductFieldsCard() {
  const fieldCount = MODELS[0]?.fields.length ?? 0;
  return (
    <CollapsibleCard.Root>
      <CollapsibleCard.Header>
        <Stack
          direction="row"
          gap="sm"
          align="center"
          justify="space-between"
          wrap="wrap"
        >
          <Text variant="heading-sm">Product fields</Text>
          <CollapsibleCard.HeaderDescription>
            <Text variant="body-sm">
              {`${fieldCount} fields, generated from the contract`}
            </Text>
          </CollapsibleCard.HeaderDescription>
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="lg" style={{ paddingTop: 12 }}>
          {MODELS.map((model) => (
            <ModelSection key={model.name} model={model} />
          ))}
          <Stack direction="column" gap="xs">
            <Text variant="heading-sm">A worked row</Text>
            <CodeBlock text={EXAMPLE_ROW} />
          </Stack>
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

function ModelSection({ model }: { model: Model }) {
  return (
    <Stack direction="column" gap="xs">
      <Text variant="heading-sm">{model.name}</Text>
      <FieldList fields={model.fields} depth={0} />
    </Stack>
  );
}

const INDENT_PX = 18;

/** Renders a block inside the field that carries it. The indent and the rule
 * are the whole point: a nested block drawn as a sibling section makes the
 * reader match a type name against something further down the page. */
function FieldList({ fields, depth }: { fields: ModelField[]; depth: number }) {
  return (
    <Stack direction="column" gap="xs">
      {fields.map((field) => (
        <Stack key={field.name} direction="column" gap="xs">
          <Row
            name={`${field.name}${field.required ? '' : '?'}`}
            type={field.type}
            note={field.note}
          />
          {field.fields && (
            <div
              style={{
                marginLeft: INDENT_PX,
                paddingLeft: INDENT_PX,
                borderLeft:
                  '1px solid var(--wpds-color-stroke-surface, #403a3a)',
              }}
            >
              <FieldList fields={field.fields} depth={depth + 1} />
            </div>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

function Row({
  name,
  type,
  note,
}: {
  name: string;
  type: string;
  note?: string;
}) {
  return (
    <Stack direction="row" gap="md" align="baseline" wrap="wrap">
      <Code>{name}</Code>
      <Badge intent="none">{type}</Badge>
      {note && <Text variant="body-sm">{note}</Text>}
    </Stack>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" justify="end">
        <CopyButton text={text} label="Copy" />
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
              overflow: 'auto',
              whiteSpace: 'pre',
            }}
          />
        }
      >
        {text}
      </Text>
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
            overflowX: 'auto',
            display: 'inline-block',
            maxWidth: '100%',
          }}
        />
      }
    >
      {children}
    </Text>
  );
}
