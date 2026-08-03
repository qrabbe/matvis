import type { ReactNode } from 'react';
import { Badge, Card, CollapsibleCard, Stack, Text } from '@wordpress/ui';
import { CATALOG_SCHEMA_VERSION } from '@matvis/shared';
import {
  MODELS,
  OPERATIONS,
  operationName,
  signature,
  typeExpression,
  type Model,
  type Operation,
} from '../lib/contract';

// v1 docs. Nothing here restates a field name, a type or a signature: the model
// tables come from the zod contract via `z.toJSONSchema`, and the operations
// come from the generated function spec (see src/lib/contract.ts). Only the
// prose is written by hand, and prose that names a field is prose about that
// field's meaning rather than about its shape.
//
// This is the clean, store-agnostic contract only; the raw per-chain product
// tables behind it are NOT exposed here.

/** Why a caller reaches for each operation. The spec carries shape, not intent,
 * so this is the one hand-written half — keyed by function name, and an
 * operation without an entry simply renders without prose. */
const OPERATION_NOTES: Record<string, string> = {
  getByEan:
    'Every clean row for one EAN. Returns an ARRAY: the catalog is keyed by (store, EAN), so each chain keeps its own row for a shared product and the caller picks. Empty when the EAN is not catalogued.',
  getManyByEan:
    'The same lookup for a whole receipt at once, without the round trips. One flat array; group by `ean` and `store` yourself. The server throws above its cap rather than truncating.',
  search:
    'Reactive, paginated rows. Empty `q` returns newest-first; a digit-only `q` of 6+ characters searches EANs; anything else runs the full-text name search (relevance-ordered). `store` narrows any of the three to one chain.',
  stats:
    'Cheap totals for a header — the maintained catalog count, plus which chains actually have rows.',
};

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
              Every catalog entry is normalized to one EAN-keyed, store-agnostic
              shape (source: <Code>packages/shared/src/catalog.ts</Code>). The
              raw per-chain product data behind it is not part of this contract.
              Everything past the identity block is optional — coverage differs
              per field and per chain, so render around what is missing.
            </Text>
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
          <Card.Title>Read endpoints</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              The catalog is a public, read-only Convex API — no account, no
              auth. Point a Convex client at the deployment and read:
            </Text>
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
              One optional nested block rather than eight sibling optionals:
              roughly a quarter of the catalog is toothbrushes, magazines and
              detergent. Check <Code>item.food</Code> once and render either the
              full card or the simple one. Its presence IS the &ldquo;this is a
              consumable&rdquo; signal — there is no <Code>kind</Code>{' '}
              classifier, because deriving one needs a per-store category
              mapping that is wrong at the edges.
            </Text>
            <Text variant="body-md">
              <strong>Not an allergen source.</strong> Allergens appear in the
              catalog only as prose inside <Code>food.ingredients</Code>. The
              structured allergen field the sources offer is on under 9% of
              rows, which is too few to promise anything, so no field here means
              &ldquo;contains no allergens&rdquo; and nothing here may be
              presented as allergen coverage.
            </Text>
            <Text variant="body-md">
              <Code>food.nutrition</Code> uses fixed slots so a consumer never
              needs a nutrient vocabulary of its own. Nutrients outside them
              (vitamins, minerals) are dropped; they are on a small minority of
              rows, and adding a slot later is a compatible change.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Versioning policy</Card.Title>
        </Card.Header>
        <Card.Content>
          <VersioningPolicy />
        </Card.Content>
      </Card.Root>
    </Stack>
  );
}

/** One operation: its signature, what it is for, its params and its response,
 * all but the prose read off the generated spec. */
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
        </Stack>
      </CollapsibleCard.Content>
    </CollapsibleCard.Root>
  );
}

/** One model's `name — type — note` table. */
function ModelSection({ model }: { model: Model }) {
  return (
    <Stack direction="column" gap="xs">
      <Text variant="heading-sm">{model.name}</Text>
      {model.fields.map((field) => (
        <Row
          key={field.name}
          name={`${field.name}${field.required ? '' : '?'}`}
          type={field.type}
          note={field.note}
        />
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

/** The compatibility rules behind the version badge. Mirrors the policy block in
 * packages/shared/src/catalog.ts, saying the same thing to a second audience. */
function VersioningPolicy() {
  return (
    <Stack direction="column" gap="sm">
      <Text variant="body-md">
        The version above is a promise, not a stamp. What it means for you as a
        consumer:
      </Text>
      <Text variant="body-sm">
        <strong>New fields do not bump it.</strong> Adding a field, or making a
        required field optional, is a compatible change — ignore fields you
        don&rsquo;t know rather than rejecting the row.
      </Text>
      <Text variant="body-sm">
        <strong>Breaking changes do.</strong> Renaming a field, removing one, or
        retyping a required one bumps the version, and the API keeps serving the
        previous version until consumers have migrated.
      </Text>
      <Text variant="body-sm">
        <strong>Old rows are upcast on read.</strong> Storage may hold several
        versions while readers only ever see the latest.
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
