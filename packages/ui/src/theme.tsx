import '@wordpress/theme/design-tokens.css';
import './theme.css';
import { ThemeProvider } from '@wordpress/theme';
import type { ReactNode } from 'react';
import { matvisSeed, matvisPinsCss } from './palette';

export function MatvisThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider isRoot color={matvisSeed}>
      {/* Pins the exact palette on top of the seed-derived tokens. Generated from
          the single source of truth in `palette.ts`; `:root` selector inside makes
          it global (covers portaled modals/menus too). */}
      <style dangerouslySetInnerHTML={{ __html: matvisPinsCss }} />
      <div className="matvis-theme">{children}</div>
    </ThemeProvider>
  );
}
