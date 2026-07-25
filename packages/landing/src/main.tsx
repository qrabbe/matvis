import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MatvisThemeProvider } from '@matvis/ui';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

// No Convex provider: the landing page is fully static content, it only links
// into the portals that do talk to a deployment.
createRoot(container).render(
  <StrictMode>
    <MatvisThemeProvider>
      <App />
    </MatvisThemeProvider>
  </StrictMode>,
);
