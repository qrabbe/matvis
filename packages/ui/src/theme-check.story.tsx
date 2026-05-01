import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Stack, Text, Badge } from '@wordpress/ui';

function Showcase() {
  return (
    <div style={{ padding: 24 }}>
      <Stack gap="md" align="flex-start">
        <Stack direction="row" gap="sm">
          <Button variant="solid" tone="brand">
            Primary
          </Button>
          <Button variant="outline" tone="neutral">
            Secondary
          </Button>
          <Button variant="minimal" tone="neutral">
            Minimal
          </Button>
        </Stack>
        <Badge intent="informational">Informational</Badge>
        <Text variant="body-md">
          Body text on the dark WordPress Design System theme.
        </Text>
      </Stack>
    </div>
  );
}

const meta = {
  title: 'Theme/Dark mode smoke test',
  component: Showcase,
} satisfies Meta<typeof Showcase>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
