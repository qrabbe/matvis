import type { Meta, StoryObj } from '@storybook/react-vite';
import { JsonView } from './JsonView';

const meta = {
  title: 'Components/JsonView',
  component: JsonView,
} satisfies Meta<typeof JsonView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    filename: 'receipt-4711.json',
    value: {
      receipt: {
        externalId: '4711',
        store: { name: 'Coop Stadshagen' },
        purchasedAt: '2026-03-14T17:22:00.000Z',
        total: 342.5,
        currency: 'SEK',
      },
      items: [
        { text: 'Havregryn 1kg', price: 24.9, isDiscount: false },
        { text: 'Medlemsrabatt', price: -5, isDiscount: true },
      ],
    },
  },
};

/** Tall payloads scroll inside the block rather than growing the modal. */
export const Scrolling: Story = {
  args: {
    filename: 'lines.json',
    value: Array.from({ length: 40 }, (_, i) => ({
      line: i + 1,
      text: `Item ${i + 1}`,
      price: Number((i * 3.5).toFixed(2)),
    })),
  },
};
