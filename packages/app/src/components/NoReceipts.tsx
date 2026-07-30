import type { ReactNode } from 'react';
import { EmptyState } from '@wordpress/ui';

/**
 * The empty state for an account with no receipts. One copy of the sentence, so
 * the three tabs that show it cannot drift apart again. Pass `children` to say
 * something more specific about the tab.
 */
export function NoReceipts({ children }: { children?: ReactNode }) {
  return (
    <EmptyState.Root>
      <EmptyState.Title>No receipts yet</EmptyState.Title>
      <EmptyState.Description>
        {children ??
          'Link a store and sync in the connector portal — receipts appear here live as they land.'}
      </EmptyState.Description>
    </EmptyState.Root>
  );
}
