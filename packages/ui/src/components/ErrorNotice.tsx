import type { ReactNode } from 'react';
import { Notice } from '@wordpress/ui';

export function ErrorNotice({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Notice.Root intent="error">
      {title && <Notice.Title>{title}</Notice.Title>}
      <Notice.Description>{children}</Notice.Description>
    </Notice.Root>
  );
}
