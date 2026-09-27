import { StrictMode, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MatvisThemeProvider } from './theme';
// Must import after `./theme` so the fallback bridge lands last.
import './app.css';

type ClientProviderProps<Client> = {
  client: Client;
  children: ReactNode;
};

export function requireConvexUrl(envFile: string, varName: string): string {
  const url = (import.meta.env as Record<string, string | undefined>)[varName];
  if (!url) {
    throw new Error(`${varName} is not set — add it to ${envFile}`);
  }
  return url;
}

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
