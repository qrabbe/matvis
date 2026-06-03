import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@wordpress/ui';
import { useCopyToClipboard } from '@wordpress/compose';

/**
 * Copy-to-clipboard control. A `@wordpress/ui` `Button` driven by the
 * `useCopyToClipboard` hook from `@wordpress/compose`, which handles the
 * Clipboard API (plus a non-secure-context / older-browser fallback) and
 * returns a ref to attach to the trigger.
 */
export function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string;
  label?: string;
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

  return (
    <Button ref={ref} variant="minimal" tone="neutral">
      {copied ? 'Copied' : label}
    </Button>
  );
}
