import type { Preview } from '@storybook/react-vite';
// Fallback-only: styles for the classic `@wordpress/components` `Spinner` that
// `InlineSpinner` renders. Consuming apps load the same sheet in their entry.
import '@wordpress/components/build-style/style.css';
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
