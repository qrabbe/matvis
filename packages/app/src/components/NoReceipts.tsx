import type { ReactNode } from 'react';
import { EmptyState } from '@wordpress/ui';

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
