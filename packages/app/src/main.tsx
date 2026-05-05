import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MatvisThemeProvider } from '@matvis/ui';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <MatvisThemeProvider>
      <App />
    </MatvisThemeProvider>
  </StrictMode>,
);
