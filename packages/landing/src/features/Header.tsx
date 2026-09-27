import { IconButton, Stack, Text } from '@wordpress/ui';

const GITHUB_ICON = (
  <svg
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
  >
    <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.2-1.2-3.2-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1.1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.7 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.6-2.2 4.4-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z" />
  </svg>
);

export function Header() {
  return (
    <Stack direction="row" justify="space-between" align="start" gap="md">
      <Stack direction="column" gap="xs">
        <Text variant="heading-2xl">Matvis</Text>
        <Text variant="body-lg" className="tagline">
          Grocery insights directly from your purchases.
        </Text>
      </Stack>
      <IconButton
        label="Source on GitHub"
        icon={GITHUB_ICON}
        variant="minimal"
        tone="neutral"
        nativeButton={false}
        render={
          <a
            href="https://github.com/qrabbe/matvis"
            target="_blank"
            rel="noreferrer"
          />
        }
      />
    </Stack>
  );
}
