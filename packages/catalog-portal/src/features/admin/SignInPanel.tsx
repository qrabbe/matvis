import { useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { Button, Card, InputControl, Stack, Text } from '@wordpress/ui';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { adminApi } from '../../lib/adminApi';
import { storeAdminToken } from '../../lib/adminSession';

export function SignInPanel({ expired = false }: { expired?: boolean }) {
  const signIn = useAction(adminApi.admin.signIn);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await signIn({ password });
      setPassword('');
      storeAdminToken(session.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Admin sign-in</Card.Title>
      </Card.Header>
      <Card.Content>
        <form onSubmit={submit}>
          <Stack direction="column" gap="md">
            {expired && (
              <Text variant="body-sm">
                That session is no longer valid. Sign in again.
              </Text>
            )}
            <InputControl
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onValueChange={(value) => setPassword(value)}
            />
            <Stack direction="row" gap="md" align="center">
              <Button type="submit" disabled={busy || password.length === 0}>
                Sign in
              </Button>
              {busy && <InlineSpinner label="Checking…" />}
            </Stack>
            {error && <ErrorNotice>{error}</ErrorNotice>}
          </Stack>
        </form>
      </Card.Content>
    </Card.Root>
  );
}
