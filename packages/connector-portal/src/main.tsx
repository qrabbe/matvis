import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { MatvisThemeProvider } from '@matvis/ui';
// Fallback-only: styles for the classic `@wordpress/components` `Spinner`. The
// rest of the portal is `@wordpress/ui` (see UI-component policy). Scoped to
// `.components-*` classes, so it doesn't bleed into the ui theme.
import '@wordpress/components/build-style/style.css';
// Styles for the `@wordpress/dataviews` receipts table (see ReceiptsPanel).
import '@wordpress/dataviews/build-style/style.css';
import { App } from './App';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set — add it to packages/connector-portal/.env.local',
  );
}
const convex = new ConvexReactClient(convexUrl);

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

// Plain `ConvexProvider` — no auth provider yet (dev `subject` shim). When real
// auth lands, switch to `ConvexProviderWithAuth`.
createRoot(container).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <MatvisThemeProvider>
        <App />
      </MatvisThemeProvider>
    </ConvexProvider>
  </StrictMode>,
);
