import { useState, type ComponentProps, type ReactNode } from 'react';
import { useConvex, useQuery } from 'convex/react';
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
import {
  CopyButton,
  ErrorNotice,
  InlineSpinner,
  JsonView,
  SkeletonList,
} from '@matvis/ui';
import { MAX_EANS_PER_LOOKUP, STORE_LABELS } from '@matvis/shared';
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
import { api } from '../lib/convexApi';

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

      <HealthBlock />

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
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Not an allergen source</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Allergens appear in the catalog only as prose inside{' '}
              <Code>food.ingredients</Code>. The structured allergen field some
              sources offer is not ingested at all, so the absence of an
              allergen in this data never means the product is free of it, and
              nothing derived from it may be presented as allergen coverage.
            </Text>
            <Text variant="body-md">
              This is a policy rather than a coverage figure. It does not change
              if coverage improves, which is why it has a heading of its own
              instead of a line in the field list.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Decisions the shape does not show</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              <strong>Price is deliberately absent.</strong> It is time-varying
              and store-specific, so it belongs to its own contract rather than
              to the description of a product. Net content and{' '}
              <Code>soldBy</Code> stay, being product facts. There is no field
              to hang this on, which is exactly why it is written here.
            </Text>
            <Text variant="body-md">
              <strong>
                There is no <Code>kind</Code> classifier.
              </strong>{' '}
              Deriving one would need a per-store category mapping that is wrong
              at the edges, so <Code>food</Code> being present is the signal
              instead. The field note says what the rule is; this says why there
              is no better one.
            </Text>
            <Text variant="body-md">
              <strong>
                Scaling to a package is a comparison, not a conversion.
              </strong>{' '}
              <Code>netContent.unit</Code> and{' '}
              <Code>food.nutrition.basisUnit</Code> share one vocabulary, so
              multiply only when they are equal. When they differ the product
              genuinely is not scalable without a density nobody has, and the
              honest answer is to skip it rather than approximate.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>
            <Stack direction="row" gap="sm" align="center">
              <span>How</span>
              <Code>search</Code>
              <span>actually matches</span>
            </Stack>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              One argument, three different mechanisms. Which one runs is
              decided by the shape of <Code>q</Code> alone.
            </Text>
            <Stack direction="column" gap="sm">
              <SearchMode
                when="empty or omitted"
                how="Plain table scan, no index."
                order="Newest first"
              />
              <SearchMode
                when="digit-only, 6 or more characters"
                how="Prefix range over the by_ean_store index. Exact or starts-with, and nothing else."
                order="EAN ascending"
              />
              <SearchMode
                when="anything else"
                how="Full-text search index on name."
                order="Relevance"
              />
            </Stack>
            <Text variant="body-md">
              <strong>Ordering is not stable across the three.</strong> One more
              keystroke can flip a list from newest-first to relevance-ordered,
              so do not build UI that assumes a stable sort or tries to re-sort
              the results by another field. This portal's own catalog table
              dropped its column sorting for exactly this reason.
            </Text>
            <Text variant="body-md">
              A digit query returns <strong>no fuzzy matches at all.</strong>{' '}
              That is a correctness decision, not an optimisation: a text index
              over barcodes would match a one-digit typo onto a different real
              product, which is worse than returning nothing.
            </Text>
            <Text variant="body-md">
              <Code>getManyByEan</Code> takes at most{' '}
              <Code>{String(MAX_EANS_PER_LOOKUP)}</Code> EANs and the server
              throws above that rather than truncating, so a caller can never
              silently get a partial answer.
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

const COVERAGE_LABELS: Record<string, string> = {
  brand: 'brand',
  imageUrl: 'image',
  netContent: 'net content',
  categoryPath: 'category path',
  countryOfOrigin: 'country of origin',
  labels: 'labels',
  food: 'food block',
  foodIngredients: 'ingredients',
  foodNutrition: 'nutrition',
};

/** Measured, not asserted. Everything here is read from the same counters the
 * console reads, which is the point: the page used to state percentages from
 * memory and they had gone stale twice over. */
function HealthBlock() {
  const health = useQuery(api.catalog.health, {});

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>What is actually in here</Card.Title>
      </Card.Header>
      <Card.Content>
        {health === undefined ? (
          <SkeletonList label="Loading catalog health…" rows={3} />
        ) : (
          <Stack direction="column" gap="lg">
            <Text variant="body-md">
              {`${health.total.toLocaleString()} products. Decide with these numbers rather than the prose below them.`}
            </Text>

            <Stack direction="column" gap="xs">
              <Text variant="body-sm">
                <strong>By chain.</strong> A chain at zero exists and has
                nothing ingested yet.
              </Text>
              <Text variant="body-md">
                {health.stores
                  .filter((row) => row.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map(
                    (row) =>
                      `${STORE_LABELS[row.store]} ${row.count.toLocaleString()}`,
                  )
                  .join(' · ') || 'Nothing ingested yet.'}
              </Text>
            </Stack>

            <Stack direction="column" gap="xs">
              <Text variant="body-sm">
                <strong>Freshness.</strong> Nothing runs on a schedule here, so
                this is how stale the data may be. It is published whether or
                not it flatters us.
              </Text>
              <Text variant="body-md">
                {`${health.freshness.verified.toLocaleString()} rows have been checked against the source at least once; ${health.freshness.neverFetched.toLocaleString()} have not been re-read since the timestamp was introduced. Of the ${health.freshness.sampleSize.toLocaleString()} most recently added, ${health.freshness.sampleWithinMonth.toLocaleString()} were verified within the last month.`}
              </Text>
            </Stack>

            <Stack direction="column" gap="xs">
              <Text variant="body-sm">
                <strong>Field coverage.</strong> Everything past{' '}
                <Code>ean</Code>, <Code>name</Code> and <Code>store</Code> is
                optional, so this is what you can expect to be there.
              </Text>
              {health.coverage.measuredAt === null ? (
                <Text variant="body-md">Not measured yet.</Text>
              ) : (
                <>
                  <Text variant="body-md">
                    {health.coverage.fields
                      .map(
                        (row) =>
                          `${COVERAGE_LABELS[row.field] ?? row.field} ${sharePercent(row.count, health.total)}`,
                      )
                      .join(' · ')}
                  </Text>
                  {/* A claim with a date ages honestly. A bare percentage
                      does not, which is how the old numbers rotted. */}
                  <Text variant="body-sm">
                    {`Measured ${new Date(health.coverage.measuredAt).toLocaleDateString()}.`}
                  </Text>
                </>
              )}
            </Stack>
          </Stack>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function sharePercent(count: number, total: number): string {
  if (total <= 0) return '—';
  return `${((count / total) * 100).toFixed(0)}%`;
}

function SearchMode({
  when,
  how,
  order,
}: {
  when: string;
  how: string;
  order: string;
}) {
  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" align="baseline" wrap="wrap">
        <Code>q</Code>
        <Text variant="body-sm">{when}</Text>
        <Badge intent="none">{order}</Badge>
      </Stack>
      <Text variant="body-sm">{how}</Text>
    </Stack>
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
