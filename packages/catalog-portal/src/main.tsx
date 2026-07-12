import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexProvider } from 'convex/react';
import { MatvisThemeProvider } from '@matvis/ui';
// Fallback-only: styles for the classic `@wordpress/components` `Spinner`. The
// rest of the portal is `@wordpress/ui` (see UI-component policy). Scoped to
// `.components-*` classes, so it doesn't bleed into the ui theme.
import '@wordpress/components/build-style/style.css';
// Styles for the `@wordpress/dataviews` catalog table (see CatalogPanel).
import '@wordpress/dataviews/build-style/style.css';
// Bridges the light-styled `@wordpress/components`/`dataviews` fallbacks onto the
// Matvis dark palette — MUST be imported last so its overrides win.
import './wp-fallback-theme.css';
import { App } from './App';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set — add it to packages/catalog-portal/.env.local',
  );
}
const convex = new ConvexReactClient(convexUrl);

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

// No auth: the catalog portal reads only the public, clean catalog table, so a
// plain `ConvexProvider` (no token storage) is all it needs.
createRoot(container).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <MatvisThemeProvider>
        <App />
      </MatvisThemeProvider>
    </ConvexProvider>
  </StrictMode>,
);
