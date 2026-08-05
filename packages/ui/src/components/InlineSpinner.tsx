import { Stack, Text } from '@wordpress/ui';
// `@wordpress/ui` has no spinner, so this is a sanctioned fallback.
import { Spinner } from '@wordpress/components';

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
