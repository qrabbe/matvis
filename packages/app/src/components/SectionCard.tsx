import type { ReactNode } from 'react';
import { Card } from '@wordpress/ui';

/**
 * A titled card: the header/title/content shape every panel repeats. Cards
 * without a title stay as a bare `Card.Root` — the header is what this exists
 * for.
 */
export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card.Root>
  );
}
