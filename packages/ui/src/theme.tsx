import '@wordpress/theme/design-tokens.css';
import './theme.css';
import { ThemeProvider } from '@wordpress/theme';
import type { ReactNode } from 'react';

const DARK_SEED = { background: '#1e1e1e', primary: '#4f8cff' };

export function MatvisThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider isRoot color={DARK_SEED}>
      <div className="matvis-theme">{children}</div>
    </ThemeProvider>
  );
}
