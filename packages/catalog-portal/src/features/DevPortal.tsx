import { useState, type ComponentProps, type ReactNode } from 'react';
import { useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
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
import {
  MODELS,
  OPERATIONS,
  operationName,
  signature,
  typeExpression,
  type Model,
  type ModelField,
  type Operation,
} from '../lib/contract';
import { argInputs, buildArgs, type ArgInput } from '../lib/tryIt';

// Documents the clean, store-agnostic contract only. The `eans` worklist behind
// it is not exposed here.
const OPERATION_NOTES: Record<string, string> = {
  getByEan:
    'Every clean row for one EAN. Returns an ARRAY: the catalog is keyed by (store, EAN), so each chain keeps its own row for a shared product and the caller picks. Empty when the EAN is not catalogued.',
  getManyByEan:
    'The same lookup for a whole receipt at once, without the round trips. One flat array; group by `ean` and `store` yourself. The server throws above its cap rather than truncating.',
  search:
    'Reactive, paginated rows. Empty `q` returns newest-first; a digit-only `q` of 6+ characters matches EANs exactly or by prefix; anything else runs the full-text name search (relevance-ordered). Filter by chain on the result, using each row’s `store`.',
  stats:
    'Cheap totals for a header — the maintained catalog count, plus which chains actually have rows.',
};

/** Hand-written, and the one thing on this page that is. The field list above
 * is generated, so this exists to show the nesting in a real payload rather
 * than to restate the shape. */
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

export function DevPortal() {
  const deploymentUrl = useConvex().url;
  return (
    <Stack direction="column" gap="xl">
      <Card.Root>
        <Card.Header>
          <Card.Title>The Catalog contract</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              The catalog is a public, read-only Convex API — no account, no
              auth, no key. Point a client at the deployment and read:
            </Text>
            <CodeBlock text={installSnippet(deploymentUrl)} />
            <Text variant="body-md">
              Every entry is normalized to one EAN-keyed, store-agnostic shape
              (source: <Code>packages/shared/src/catalog.ts</Code>). Everything
              past the identity block is optional — coverage differs per field
              and per chain, so render around what is missing.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Operations</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            {OPERATIONS.map((op) => (
              <OperationEntry key={op.identifier} operation={op} />
            ))}
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Models</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="lg">
            <Text variant="body-md">
              Reads also carry the two Convex system fields, <Code>_id</Code>{' '}
              and <Code>_creationTime</Code>, which are not part of the contract
              itself.
            </Text>
            {MODELS.map((model) => (
              <ModelSection key={model.name} model={model} />
            ))}
            <Stack direction="column" gap="xs">
              <Text variant="heading-sm">A worked row</Text>
              <Text variant="body-md">
                Everything optional is present here. Most rows carry a fraction
                of it.
              </Text>
              <CodeBlock text={EXAMPLE_ROW} />
            </Stack>
            <Text variant="body-md">
              <strong>Price is deliberately absent.</strong> It is time-varying
              and store-specific, so it belongs to its own contract rather than
              to the description of a product. Package size and sales unit stay,
              being product facts.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>
            <Stack direction="row" gap="sm" align="center">
              <span>Reading a product</span>
              <Code>item.food</Code>
            </Stack>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              One optional nested block rather than eight sibling optionals,
              because a large part of the catalog is not food at all —
              toothbrushes, magazines and detergent. Check{' '}
              <Code>item.food</Code> once and render either the full card or the
              simple one. Its presence IS the &ldquo;this is a consumable&rdquo;
              signal — there is no <Code>kind</Code> classifier, because
              deriving one needs a per-store category mapping that is wrong at
              the edges.
            </Text>
            <Text variant="body-md">
              <strong>Not an allergen source.</strong> Allergens appear in the
              catalog only as prose inside <Code>food.ingredients</Code>. The
              structured allergen field some sources offer is not ingested at
              all, so no field here means &ldquo;contains no allergens&rdquo;
              and nothing here may be presented as allergen coverage. This is a
              policy, not a coverage figure: it does not change if coverage
              improves.
            </Text>
            <Text variant="body-md">
              <Code>food.nutrition</Code> uses fixed slots so a consumer never
              needs a nutrient vocabulary of its own. Nutrients outside them
              (vitamins, minerals) are dropped rather than passed through, and
              adding a slot later is a compatible change.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>What is behind a catalog row</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              <strong>Source payloads are not stored.</strong> A catalog row is
              projected from a chain's API response at fetch time and the
              response is then discarded, so there is no raw row to dereference
              and no <Code>sourceTable</Code> or <Code>sourceId</Code> to quote.
              Rows carry <Code>_creationTime</Code>, which is when we first
              wrote the product.
            </Text>
            <Text variant="body-md">
              What we keep alongside <Code>catalog</Code> is <Code>eans</Code>:
              a flat list of every barcode we have heard of per chain. It is the
              worklist a sweep walks to find products the catalog is missing,
              and it is not searchable or part of any public promise. That is{' '}
              <em>enforced</em> rather than documented: every{' '}
              <Code>ingest.js:*</Code> and <Code>backfill.js:*</Code> function
              is registered <Code>internal</Code>, which makes it unreachable by
              any client whatever it asks for. The operations above are the
              whole public surface.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>
    </Stack>
  );
}

function installSnippet(deploymentUrl: string): string {
  return [
    'npm install convex',
    '',
    'import { ConvexHttpClient } from "convex/browser";',
    '',
    `const catalog = new ConvexHttpClient("${deploymentUrl}");`,
    'const rows = await catalog.query("catalog:getByEan", {',
    '  ean: "11210000155",',
    '});',
  ].join('\n');
}

function OperationEntry({ operation }: { operation: Operation }) {
  const params = Object.entries(operation.args.value);
  const note = OPERATION_NOTES[operationName(operation)];
  return (
    <CollapsibleCard.Root>
      <CollapsibleCard.Header>
        <Stack direction="row" gap="sm" align="center" wrap="wrap">
          <Code>{signature(operation)}</Code>
          <Badge intent="stable">live</Badge>
        </Stack>
      </CollapsibleCard.Header>
      <CollapsibleCard.Content>
        <Stack direction="column" gap="md" style={{ paddingTop: 12 }}>
          {note && <Text variant="body-sm">{note}</Text>}
          <Stack direction="column" gap="xs">
            <Text variant="heading-sm">Parameters</Text>
            {params.length === 0 ? (
              <Text variant="body-sm">None.</Text>
            ) : (
              params.map(([name, field]) => (
                <Row
                  key={name}
                  name={`${name}${field.optional ? '?' : ''}`}
                  type={typeExpression(field.fieldType)}
                />
              ))
            )}
          </Stack>
          <Stack direction="column" gap="xs">
            <Text variant="heading-sm">Response</Text>
            <Code>{typeExpression(operation.returns)}</Code>
          </Stack>
          <TryIt operation={operation} />
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

type CallState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; value: unknown }
  | { status: 'failed'; message: string };

function TryIt({ operation }: { operation: Operation }) {
  const convex = useConvex();
  const name = operationName(operation);
  const inputs = argInputs(operation);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((input) => [input.name, input.example])),
  );
  const [state, setState] = useState<CallState>({ status: 'idle' });

  async function run() {
    setState({ status: 'running' });
    try {
      const value = await convex.query(
        makeFunctionReference<'query'>(`catalog:${name}`),
        buildArgs(operation, values),
      );
      setState({ status: 'done', value });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Stack direction="column" gap="sm">
      <Text variant="heading-sm">Try it</Text>
      <Stack direction="row" gap="md" align="end" wrap="wrap">
        {inputs.map((input) => (
          <ArgField
            key={input.name}
            input={input}
            value={values[input.name] ?? ''}
            onChange={(next) =>
              setValues((current) => ({ ...current, [input.name]: next }))
            }
          />
        ))}
        <Button onClick={run} disabled={state.status === 'running'}>
          Run
        </Button>
      </Stack>
      {state.status === 'running' && <InlineSpinner label="Calling…" />}
      {state.status === 'failed' && <ErrorNotice>{state.message}</ErrorNotice>}
      {state.status === 'done' && (
        <JsonView value={state.value} filename={`catalog-${name}.json`} />
      )}
    </Stack>
  );
}

type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

const UNSET: SelectItem = { label: 'Any', value: null };

function ArgField({
  input,
  value,
  onChange,
}: {
  input: ArgInput;
  value: string;
  onChange: (next: string) => void;
}) {
  const label = `${input.name}${input.optional ? '?' : ''}`;
  if (input.kind === 'choice') {
    const items: SelectItem[] = [
      ...(input.optional ? [UNSET] : []),
      ...input.options.map((option) => ({ label: option, value: option })),
    ];
    const selection = items.find((item) => item.value === value) ?? UNSET;
    return (
      <div style={{ flex: '0 1 180px' }}>
        <SelectControl
          label={label}
          items={items}
          value={selection}
          onValueChange={(item) => onChange(item?.value ?? '')}
        />
      </div>
    );
  }
  return (
    <div style={{ flex: '1 1 220px' }}>
      <InputControl
        label={label}
        description={input.kind === 'list' ? 'Comma separated.' : undefined}
        value={value}
        onValueChange={(next) => onChange(next)}
      />
    </div>
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
          }}
        />
      }
    >
      {children}
    </Text>
  );
}
