import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkeletonList } from './SkeletonList';

const meta = {
  title: 'Components/SkeletonList',
  component: SkeletonList,
} satisfies Meta<typeof SkeletonList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Loading runs…' },
};

/** A longer list, for a table that fills most of a card. */
export const Table: Story = {
  args: { label: 'Loading queue…', rows: 6 },
};

/** Taller rows, for a detail view rather than a list of one-line rows. */
export const Detail: Story = {
  args: { label: 'Loading product…', rows: 4, rowHeight: 32 },
};
