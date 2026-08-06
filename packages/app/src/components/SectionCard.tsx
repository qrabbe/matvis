import type { ReactNode } from 'react';
import { Card } from '@wordpress/ui';

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
