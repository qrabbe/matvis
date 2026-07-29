import { Badge, Card, LinkButton, Stack, Text } from '@wordpress/ui';
import { Section } from '../components/Section';

type Portal = {
  title: string;
  status: { label: string; intent: 'stable' | 'draft' };
  desc: string;
  points: string[];
  /** Relative to the Pages root, so the same links work under any base path. */
  href?: string;
  cta?: string;
  /** Matches the button treatment this portal has in the hero. */
  variant?: 'solid' | 'outline';
};

const PORTALS: Portal[] = [
  {
    title: 'Connector',
    status: { label: 'live', intent: 'stable' },
    desc: 'Links a store account and syncs your purchases into normalized receipts.',
    points: [
      'Sign in to a store with BankID, on this device or by QR',
      'Browse every receipt it has synced, newest first',
      'Read the receipt API docs and the versioned Receipt contract',
    ],
    href: 'connector/',
    cta: 'Open the connector',
    variant: 'solid',
  },
  {
    title: 'Catalog',
    status: { label: 'in progress', intent: 'draft' },
    desc: 'A public, read-only product database keyed by GTIN/EAN across store chains.',
    points: [
      'Search Swedish grocery products by name',
      'Look up the EAN that receipt line items carry',
      'Read the public catalog API, no account needed',
    ],
    href: 'catalog/',
    cta: 'Open the catalog',
    variant: 'outline',
  },
  {
    title: 'Matvis app',
    status: { label: 'live', intent: 'stable' },
    desc: 'Pantry, nutrition and purchase insight over your synced receipts.',
    points: [
      'Turn synced receipts into a pantry that updates itself',
      'Nutrition and spending charts over real purchases',
      'Needs an API token minted in the connector portal, the app has no sign-in of its own',
    ],
    href: 'app/',
    cta: 'Open the app',
    variant: 'outline',
  },
];

/** The three entry points, each a card. A system without a UI shows without a link. */
export function Portals() {
  return (
    <Section
      title="Where to start"
      lead="Matvis is a set of independent systems. Each one has a web UI you can open right now."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {PORTALS.map((portal) => (
          <Card.Root key={portal.title}>
            <Card.Header>
              <Card.Title>
                <Stack direction="row" gap="sm" align="center" wrap="wrap">
                  <span>{portal.title}</span>
                  <Badge intent={portal.status.intent}>
                    {portal.status.label}
                  </Badge>
                </Stack>
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <Stack direction="column" gap="md" align="flex-start">
                <Text variant="body-md">{portal.desc}</Text>
                <Stack
                  direction="column"
                  gap="xs"
                  render={<ul />}
                  style={{ margin: 0, paddingLeft: 18 }}
                >
                  {portal.points.map((point) => (
                    <Text key={point} variant="body-sm" render={<li />}>
                      {point}
                    </Text>
                  ))}
                </Stack>
                {portal.href && (
                  <LinkButton
                    href={portal.href}
                    variant={portal.variant}
                    tone={portal.variant === 'outline' ? 'neutral' : 'brand'}
                  >
                    {portal.cta}
                  </LinkButton>
                )}
              </Stack>
            </Card.Content>
          </Card.Root>
        ))}
      </div>
    </Section>
  );
}
