import { Stack, Text } from '@wordpress/ui';
// Fallback: `@wordpress/ui` has no spinner (only `skeleton`), so the classic
// `@wordpress/components` `Spinner` is the standard exception (see UI-component
// policy). Its stylesheet is loaded once by each consuming app's entry point.
import { Spinner } from '@wordpress/components';

/** The standard "working…" row — a spinner with an inline label. */
export function InlineSpinner({
  label,
  variant = 'body-sm',
}: {
  label: string;
  variant?: 'body-sm' | 'body-md';
}) {
  return (
    <Stack direction="row" gap="sm" align="center">
      <Spinner />
      <Text variant={variant}>{label}</Text>
    </Stack>
  );
}
