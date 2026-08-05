import '@wordpress/theme/design-tokens.css';
import './theme.css';
import { ThemeProvider } from '@wordpress/theme';
import type { ReactNode } from 'react';
import { matvisSeed, matvisPinsCss } from './palette';

export function MatvisThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider isRoot color={matvisSeed}>
      <style dangerouslySetInnerHTML={{ __html: matvisPinsCss }} />
      <div className="matvis-theme">{children}</div>
    </ThemeProvider>
  );
}
