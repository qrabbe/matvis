import { useState } from 'react';
import { Stack, Text } from '@wordpress/ui';
import { isAccessTokenValid } from '@matvis/connect';
import type { TokenSet } from '@matvis/shared';
import { AuthPanel } from './features/AuthPanel';
import { ReceiptList } from './features/ReceiptList';
import { loadTokens } from './lib/tokenStore';

export function App() {
  const [tokens, setTokens] = useState<TokenSet | null>(() => loadTokens());
  const canListReceipts = tokens ? isAccessTokenValid(tokens) : false;

  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}
    >
      <Stack direction="column" gap="xs">
        <Text variant="heading-xl">Matvis</Text>
        <Text variant="body-md">Coop receipt connector</Text>
      </Stack>

      <AuthPanel tokens={tokens} onTokens={setTokens} />

      {canListReceipts && tokens && (
        <ReceiptList accessToken={tokens.accessToken} />
      )}
    </Stack>
  );
}
