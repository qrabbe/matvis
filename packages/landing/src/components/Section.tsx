import type { ReactNode } from 'react';
import { Stack, Text } from '@wordpress/ui';

/** One titled block of the page: heading, optional lead paragraph, content. */
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
