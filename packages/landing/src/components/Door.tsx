import type { ReactNode } from 'react';
import { Card, Icon, Stack, Text, VisuallyHidden } from '@wordpress/ui';
import { chevronRight } from '@wordpress/icons';

export function Door({
  href,
  name,
  glyph,
  access,
  accessLabel,
  accessHint,
  primary,
  compact,
  children,
}: {
  href: string;
  name: string;
  glyph: typeof chevronRight;
  access: typeof chevronRight;
  accessLabel: string;
  accessHint: string;
  primary?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <Card.Root
      render={<a href={href} />}
      className={primary ? 'door primary' : 'door'}
    >
      <Card.Content className="door-body">
        <div className="door-preview" aria-hidden="true">
          {children}
          <span className="access" title={accessLabel}>
            <Icon icon={access} size={16} />
          </span>
        </div>
        <Stack direction="row" align="center" justify="space-between">
          <Stack direction="row" align="center" gap="sm" className="door-name">
            <Icon icon={glyph} />
            <Text variant="heading-md">{name}</Text>
            <VisuallyHidden>{accessHint}</VisuallyHidden>
          </Stack>
          {!compact && (
            <span className="go">
              <Icon icon={chevronRight} />
            </span>
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}
