import type { ReactNode } from 'react';
import { Stack, Text } from '@wordpress/ui';

export function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack direction="column" gap="lg" render={<section />}>
      <Stack direction="column" gap="xs">
        <Text variant="heading-lg">{title}</Text>
        {lead && <Text variant="body-md">{lead}</Text>}
      </Stack>
      {children}
    </Stack>
  );
}
