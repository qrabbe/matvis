import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineSpinner } from './InlineSpinner';

const meta = {
  title: 'Components/InlineSpinner',
  component: InlineSpinner,
} satisfies Meta<typeof InlineSpinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Small: Story = {
  args: { label: 'Loading receipts…' },
};

/** `body-md` for a spinner that stands alone rather than sitting in a list. */
export const Medium: Story = {
  args: { label: 'Starting BankID…', variant: 'body-md' },
};
