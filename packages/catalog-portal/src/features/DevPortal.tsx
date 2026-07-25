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
    name: 'brand?',
    type: 'string',
    note: 'Manufacturer or brand name, e.g. "Santa Maria".',
  },
  {
    name: 'imageUrl?',
    type: 'string',
    note: 'Product image, normalized to an https URL a browser can render.',
  },
  {
    name: 'packageSize?',
    type: 'number',
    note: 'Numeric package size, e.g. 360. Pairs with packageSizeUnit.',
  },
  {
    name: 'packageSizeUnit?',
    type: 'string',
    note: 'Unit of packageSize, verbatim from the source, e.g. "Gram".',
  },
  {
    name: 'packageSizeText?',
    type: 'string',
    note: 'Package size as printed, e.g. "360g". Prefer this for display.',
  },
  {
    name: 'salesUnit?',
    type: 'string',
    note: 'How the product is sold, e.g. "Styck" or "Vikt".',
  },
  {
    name: 'categoryPath?',
    type: 'string[]',
    note: 'Category breadcrumb, root first and leaf last.',
  },
  {
    name: 'description?',
    type: 'string',
    note: 'Marketing description, free prose.',
  },
  {
    name: 'countryOfOrigin?',
    type: 'string',
    note: 'Country of origin as a display name, e.g. "Sverige".',
  },
  {
    name: 'labels?',
    type: 'string[]',
    note: 'Certification labels, e.g. "KRAV", "Nyckelhålet". Display names only.',
  },
  {
    name: 'food?',
    type: 'CatalogFood',
    note: 'Present only for consumable products — absent entirely for a toothbrush. Its presence IS the "this is food" signal; there is no kind classifier.',
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

const FOOD_FIELDS: Field[] = [
  {
    name: 'ingredients?',
    type: 'string',
    note: 'Ingredient list as printed on the package, free prose.',
  },
  {
    name: 'nutrition?',
    type: 'CatalogNutrition',
    note: 'Fixed nutrient slots, stated per basisQuantity basisUnit.',
  },
];

const NUTRITION_FIELDS: Field[] = [
  {
    name: 'basisQuantity',
    type: 'number',
    note: 'Amount the values are stated per, e.g. 100.',
  },
  {
    name: 'basisUnit',
    type: 'string',
    note: '"g", "ml" or "st" (pieces).',
  },
  {
    name: 'energyKcal? / energyKj?',
    type: 'number',
    note: 'Energy, both units when the source states both.',
  },
  {
    name: 'fatG? / saturatedFatG?',
    type: 'number',
    note: 'Fat, and of which saturated, in grams.',
  },
  {
    name: 'carbohydrateG? / sugarsG?',
    type: 'number',
    note: 'Carbohydrate, and of which sugars, in grams.',
  },
  {
    name: 'fiberG? / proteinG? / saltG?',
    type: 'number',
    note: 'Fibre, protein and salt, in grams.',
  },
];

type Endpoint = { sig: string; desc: string };

const READ_ENDPOINTS: Endpoint[] = [
  {
    sig: 'catalog.getByEan({ ean })',
    desc: 'Every clean row for one EAN. Returns an ARRAY: the catalog is keyed by (store, EAN), so each chain keeps its own row for a shared product and the caller picks. Empty when the EAN is not catalogued.',
  },
  {
    sig: 'catalog.getManyByEan({ eans })',
    desc: 'The same lookup for up to 100 EANs at once — a whole receipt without the round trips. One flat array; group by `ean` and `store` yourself.',
  },
  {
    sig: 'catalog.search({ q?, store?, paginationOpts })',
    desc: 'Reactive, paginated rows. Empty `q` returns newest-first; a digit-only `q` of 6+ characters searches EANs; anything else runs the full-text name search (relevance-ordered). `store` narrows any of the three to one chain.',
  },
  {
    sig: 'catalog.stats()',
    desc: 'Cheap totals for the header — the maintained catalog count, plus which chains actually have rows.',
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
              product data behind it is not part of this contract. Everything
              past the identity block is optional — coverage differs per field
              and per chain, so render around what is missing.
            </Text>
            <FieldTable fields={CATALOG_FIELDS} />
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
              <span>CatalogFood</span>
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
            <FieldTable fields={FOOD_FIELDS} />
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
            <FieldTable fields={NUTRITION_FIELDS} />
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

/** One `name — type — note` row per field. */
function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <Stack direction="column" gap="xs">
      {fields.map((f) => (
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
