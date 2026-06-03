import { useCallback, useState } from 'react';
import { Badge, Button, Card, Notice, Stack, Text } from '@wordpress/ui';
import { isAccessTokenValid } from '@matvis/connect';
import type { TokenSet } from '@matvis/shared';
import { connector } from '../lib/connector';
import { clearTokens, saveTokens } from '../lib/tokenStore';
import { errMsg } from '../lib/format';
import { useBankIdLogin } from '../hooks/useBankIdLogin';
import { QrCode } from '../components/QrCode';

export function AuthPanel({
  tokens,
  onTokens,
}: {
  tokens: TokenSet | null;
  onTokens: (tokens: TokenSet | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onComplete = useCallback(
    (next: TokenSet) => {
      saveTokens(next);
      onTokens(next);
    },
    [onTokens],
  );

  const { active, qr, hint, appLink, error, login, cancel, reset } =
    useBankIdLogin(onComplete);

  const refresh = useCallback(async () => {
    if (!tokens) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await connector.refresh(tokens.refreshToken);
      saveTokens(next);
      onTokens(next);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [tokens, onTokens]);

  const clear = useCallback(() => {
    reset();
    clearTokens();
    onTokens(null);
    setActionError(null);
  }, [onTokens, reset]);

  const message = error ?? actionError;
  const valid = tokens ? isAccessTokenValid(tokens) : false;

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>BankID</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          {message && (
            <Notice.Root intent="error">
              <Notice.Title>Something went wrong</Notice.Title>
              <Notice.Description>{message}</Notice.Description>
            </Notice.Root>
          )}

          {tokens ? (
            <AuthenticatedView
              tokens={tokens}
              valid={valid}
              busy={busy}
              onRefresh={refresh}
              onClear={clear}
            />
          ) : active ? (
            <LoginInProgressView
              qr={qr}
              hint={hint}
              appLink={appLink}
              onCancel={cancel}
            />
          ) : (
            <LoggedOutView onLogin={login} />
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function AuthenticatedView({
  tokens,
  valid,
  busy,
  onRefresh,
  onClear,
}: {
  tokens: TokenSet;
  valid: boolean;
  busy: boolean;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <Stack direction="column" gap="md">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Badge intent={valid ? 'stable' : 'high'}>
          {valid ? 'Authenticated' : 'Expired'}
        </Badge>
        <Text variant="body-sm">
          {tokens.expiresAt
            ? `Access token ${valid ? 'valid until' : 'expired at'} ${new Date(
                tokens.expiresAt,
              ).toLocaleString()}`
            : 'No expiry reported'}
        </Text>
      </Stack>
      <Stack direction="row" gap="sm" wrap="wrap">
        <Button onClick={onRefresh} loading={busy}>
          Refresh BankID
        </Button>
        <Button variant="outline" tone="neutral" onClick={onClear}>
          Clear tokens
        </Button>
      </Stack>
    </Stack>
  );
}

function LoginInProgressView({
  qr,
  hint,
  appLink,
  onCancel,
}: {
  qr: string | null;
  hint: string | null;
  appLink: string | null;
  onCancel: () => void;
}) {
  return (
    <Stack direction="column" gap="md" align="center">
      {qr ? (
        <QrCode value={qr} />
      ) : (
        <Text variant="body-md">Starting BankID…</Text>
      )}
      <Text variant="body-sm">
        {hint ?? 'Open the BankID app on your phone and scan the code.'}
      </Text>
      {appLink && (
        <Button variant="outline" tone="neutral" render={<a href={appLink} />}>
          Open BankID on this device
        </Button>
      )}
      <Button variant="minimal" tone="neutral" onClick={onCancel}>
        Cancel
      </Button>
    </Stack>
  );
}

function LoggedOutView({ onLogin }: { onLogin: () => void }) {
  return (
    <Stack direction="column" gap="sm" align="start">
      <Text variant="body-md">
        Sign in with BankID to load your Coop receipts.
      </Text>
      <Button onClick={onLogin}>Log in with BankID</Button>
    </Stack>
  );
}
