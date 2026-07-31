import { StrictMode, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MatvisThemeProvider } from './theme';
// Imported after `./theme` so the fallback bridge still lands last.
import './app.css';

type ClientProviderProps<Client> = {
  client: Client;
  children: ReactNode;
};

/** Reads `VITE_CONVEX_URL`, or throws naming the env file that should set it. */
export function requireConvexUrl(envFile: string): string {
  const url = (import.meta.env as Record<string, string | undefined>)
    .VITE_CONVEX_URL;
  if (!url) {
    throw new Error(`VITE_CONVEX_URL is not set — add it to ${envFile}`);
  }
  return url;
}

/** Renders a frontend into `#root` inside StrictMode, its Convex provider and
 * the Matvis theme. `Provider` is the caller's choice, and that choice is what
 * decides whether the frontend carries an auth context at all. */
export function mountApp<Client>({
  client,
  Provider,
  children,
}: {
  client: Client;
  Provider: ComponentType<ClientProviderProps<Client>>;
  children: ReactNode;
}) {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root element not found');

  createRoot(container).render(
    <StrictMode>
      <Provider client={client}>
        <MatvisThemeProvider>{children}</MatvisThemeProvider>
      </Provider>
    </StrictMode>,
  );
}
