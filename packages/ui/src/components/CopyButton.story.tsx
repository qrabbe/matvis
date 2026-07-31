import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyButton } from './CopyButton';

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
} satisfies Meta<typeof CopyButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Text: Story = {
  args: { text: 'kk_live_9f2a…', label: 'Copy token' },
};

/** The compact form, for a tight input suffix or a table cell. */
export const Icon: Story = {
  args: { text: 'kk_live_9f2a…', label: 'Copy token', icon: true },
};
