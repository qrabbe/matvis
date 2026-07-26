import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '@wordpress/ui';
import { useCopyToClipboard } from '@wordpress/compose';
import { checkIcon, copyIcon } from './icons';

/**
 * Copy-to-clipboard control. A `@wordpress/ui` button driven by the
 * `useCopyToClipboard` hook from `@wordpress/compose`, which handles the
 * Clipboard API (plus a non-secure-context / older-browser fallback) and
 * returns a ref to attach to the trigger.
 *
 * By default it renders a text `Button`. Pass `icon` for a compact `IconButton`
 * (e.g. inside a tight input suffix), which swaps to a checkmark on success.
 */
export function CopyButton({
  text,
  label = 'Copy',
  icon = false,
}: {
  text: string;
  label?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onSuccess = useCallback(() => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  const ref = useCopyToClipboard<HTMLButtonElement>(text, onSuccess);

  if (icon) {
    return (
      <IconButton
        ref={ref}
        variant="minimal"
        tone="neutral"
        size="small"
        icon={copied ? checkIcon : copyIcon}
        label={copied ? 'Copied' : label}
      />
    );
  }

  return (
    <Button ref={ref} variant="minimal" tone="neutral">
      {copied ? 'Copied' : label}
    </Button>
  );
}
