import { useMemo } from 'react';
import { Button, Stack, Text } from '@wordpress/ui';
import { CopyButton } from './CopyButton';
import { downloadJson } from '../download';

/** A JSON payload as a scrollable monospace block with copy and download
 * controls above it. Pass a stable `value` (memoize it at the call site) so the
 * pretty-print is not redone on every parent render. */
export function JsonView({
  value,
  filename,
}: {
  value: unknown;
  filename: string;
}) {
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <Stack direction="column" gap="sm">
      <Stack direction="row" gap="sm" align="center" justify="end" wrap="wrap">
        <CopyButton text={json} label="Copy JSON" />
        <Button
          variant="outline"
          tone="neutral"
          onClick={() => downloadJson(value, filename)}
        >
          Download JSON
        </Button>
      </Stack>
      <Text
        variant="body-sm"
        render={
          <pre
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'rgba(127,127,127,0.16)',
              padding: '10px 12px',
              borderRadius: 6,
              margin: 0,
              maxHeight: 320,
              overflow: 'auto',
              whiteSpace: 'pre',
            }}
          />
        }
      >
        {json}
      </Text>
    </Stack>
  );
}
