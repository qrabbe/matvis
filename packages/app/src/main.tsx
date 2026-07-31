import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { MatvisThemeProvider } from '@matvis/ui';
// Fallback-only: styles for the classic `@wordpress/components` `Spinner`. The
// rest of the app is `@wordpress/ui` (see UI-component policy). Scoped to
// `.components-*` classes, so it doesn't bleed into the ui theme.
import '@wordpress/components/build-style/style.css';
// Styles for the `@wordpress/dataviews` tables (Purchases and Unmapped).
import '@wordpress/dataviews/build-style/style.css';
// Bridges the light-styled `@wordpress/components`/`dataviews` fallbacks onto
// the Matvis dark palette — MUST be imported last so its overrides win.
import '@matvis/ui/wp-fallback.css';
import { App } from './App';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set — add it to packages/app/.env.local',
  );
}
const convex = new ConvexReactClient(convexUrl);

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

// `ConvexProvider`, NOT `ConvexAuthProvider` — and that absence is the whole
// read-only story. Every connector write (`links.*`, `sync.sync`,
// `accessToken.create`) resolves the caller through `getAuthUserId` and throws
// `Unauthenticated` when there is no session, so with no auth context mounted
// the app cannot reach a write handler at all. It authenticates with the account
// API token instead, which the read API accepts on its own. The catalog needs no
// equivalent: its entire public surface is queries.
//
// The catalog deployment is deliberately NOT a provider here — `useQuery`
// resolves one client from context, so the second deployment is called
// imperatively (see lib/catalogClient.ts).
createRoot(container).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <MatvisThemeProvider>
        <App />
      </MatvisThemeProvider>
    </ConvexProvider>
  </StrictMode>,
);
