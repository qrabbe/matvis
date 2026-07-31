import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, Text, IconButton } from '@wordpress/ui';
import { checkIcon, copyIcon, eyeIcon, eyeOffIcon } from './icons';

const ICONS = [
  ['copyIcon', copyIcon],
  ['checkIcon', checkIcon],
  ['eyeIcon', eyeIcon],
  ['eyeOffIcon', eyeOffIcon],
] as const;

function IconSet() {
  return (
    <Stack direction="row" gap="lg" align="center">
      {ICONS.map(([name, icon]) => (
        <Stack key={name} gap="xs" align="center">
          <IconButton
            variant="minimal"
            tone="neutral"
            icon={icon}
            label={name}
          />
          <Text variant="body-sm">{name}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

const meta = {
  title: 'Components/Icons',
  component: IconSet,
} satisfies Meta<typeof IconSet>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
