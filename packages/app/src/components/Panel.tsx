import type { ReactNode } from 'react';
import { Text } from '@wordpress/ui';

export function Panel({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: 'grid',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 28,
        }}
      >
        <Text variant="body-sm" render={<h2 />} style={panelTitleStyle}>
          {title}
        </Text>
        {aside}
      </div>
      {children}
    </section>
  );
}

const panelTitleStyle = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--wpds-color-foreground-content-neutral-weak)',
} as const;
