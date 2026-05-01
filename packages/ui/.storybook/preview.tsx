import type { Preview } from '@storybook/react-vite';
import { MatvisThemeProvider } from '../src/theme';

const preview: Preview = {
  parameters: {
    // The theme provider paints the dark background itself
    backgrounds: { disable: true },
  },
  decorators: [
    (Story) => (
      <MatvisThemeProvider>
        <Story />
      </MatvisThemeProvider>
    ),
  ],
};

export default preview;
