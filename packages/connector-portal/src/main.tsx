import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { MatvisThemeProvider } from '@matvis/ui';
// Fallback-only: styles for the classic `@wordpress/components` `Spinner`. The
// rest of the portal is `@wordpress/ui` (see UI-component policy). Scoped to
// `.components-*` classes, so it doesn't bleed into the ui theme.
import '@wordpress/components/build-style/style.css';
// Styles for the `@wordpress/dataviews` receipts table (see ReceiptsPanel).
import '@wordpress/dataviews/build-style/style.css';
// Bridges the light-styled `@wordpress/components`/`dataviews` fallbacks onto the
// Matvis dark palette — MUST be imported last so its overrides win.
import './wp-fallback-theme.css';
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

// `ConvexAuthProvider` supplies the auth context (token storage + refresh) that
// the connector's identity seam reads via `getUserIdentity()`. The App gates its
// body on `<Authenticated>` / `<Unauthenticated>` (GitHub sign-in).
createRoot(container).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <MatvisThemeProvider>
        <App />
      </MatvisThemeProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
