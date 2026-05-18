import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { MatvisThemeProvider } from '@matvis/ui';
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
