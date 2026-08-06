import { LinkButton, Stack, Text } from '@wordpress/ui';

export function Hero() {
  return (
    <Stack direction="column" gap="lg" render={<header />}>
      <Stack direction="column" gap="sm">
        <Text variant="heading-2xl">Matvis</Text>
        <Text variant="body-xl">
          Your grocery receipts as clear, structured purchase data.
        </Text>
      </Stack>
      <Text variant="body-md">
        Link a Swedish grocery account once, and Matvis keeps syncing every
        receipt into one versioned, store-agnostic shape: store, timestamp,
        totals, VAT and itemized lines. Those lines carry a GTIN that joins onto
        an EAN-keyed product catalog, so a purchase becomes a product with real
        data behind it. Everything is reactive and open to build on, from pantry
        tracking to nutrition charts.
      </Text>
      <Stack direction="row" gap="md" align="center" wrap="wrap">
        <LinkButton href="connector/">Open the connector</LinkButton>
        <LinkButton href="catalog/" variant="outline" tone="neutral">
          Open the catalog
        </LinkButton>
        <LinkButton href="app/" variant="outline" tone="neutral">
          Open the app
        </LinkButton>
        <LinkButton
          href="https://github.com/qrabbe/matvis"
          variant="outline"
          tone="neutral"
          openInNewTab
        >
          Source on GitHub
        </LinkButton>
      </Stack>
    </Stack>
  );
}
