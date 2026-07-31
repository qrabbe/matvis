import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorNotice } from './ErrorNotice';

const meta = {
  title: 'Components/ErrorNotice',
  component: ErrorNotice,
} satisfies Meta<typeof ErrorNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Titled: Story = {
  args: {
    title: 'Couldn’t sign in',
    children: 'The BankID session expired before it was collected.',
  },
};

/** No title: the inline form used inside a modal or under a field. */
export const Untitled: Story = {
  args: { children: 'Enter a token before saving.' },
};
