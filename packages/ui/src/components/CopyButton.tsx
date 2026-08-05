import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '@wordpress/ui';
import { useCopyToClipboard } from '@wordpress/compose';
import { check, copy } from '@wordpress/icons';

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
        icon={copied ? check : copy}
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
