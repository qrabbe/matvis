import type { ReactNode } from 'react';
import { Notice } from '@wordpress/ui';

/** Standard error banner. Renders an optional bold title above the message;
 * omit `title` for an untitled inline error (e.g. inside a modal). */
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
