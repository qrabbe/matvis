import { useCallback, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Button, Card, IconButton, Input, Stack, Text } from '@wordpress/ui';
import { CopyButton } from '../components/CopyButton';
import { ErrorNotice } from '../components/ErrorNotice';
import { InlineSpinner } from '../components/InlineSpinner';
import { eyeIcon, eyeOffIcon } from '../components/icons';
import { api } from '../lib/convexApi';
import { errMsg } from '../lib/format';

/** Reveals (and, on first use, mints) the account-wide API token. This is the
 * one credential a third-party service takes away: paired with the deployment's
 * public URL and the `convex` SDK it's enough to read this account's receipts,
 * with no login and no secret from us. Copy it, then try it in the "Try a token"
 * tab. */
export function TokenPanel() {
  const token = useQuery(api.accessToken.get); // undefined = loading, null = none yet
  const createToken = useMutation(api.accessToken.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await createToken({});
      // The reactive `get` query refreshes on its own once the row is patched.
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [createToken]);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Your API token</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <Text variant="body-md">
            One token for your whole account. Any service holding it — plus this
            deployment&rsquo;s public URL and the <code>convex</code> client —
            can read your receipts, with no login and no credential from us. Try
            it yourself in the <strong>Try a token</strong> tab.
          </Text>

          {error && (
            <ErrorNotice title="Couldn’t create token">{error}</ErrorNotice>
          )}

          {token === undefined ? (
            <InlineSpinner label="Loading…" />
          ) : token === null ? (
            <Button
              variant="solid"
              onClick={() => void create()}
              loading={busy}
            >
              Create API token
            </Button>
          ) : (
            <TokenField token={token} />
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

/** The minted token in a read-only field: masked by default, with reveal and
 * copy controls in the input's suffix slot. */
function TokenField({ token }: { token: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Input
      readOnly
      value={token}
      type={revealed ? 'text' : 'password'}
      aria-label="API token"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
      suffix={
        <Stack direction="row" gap="xs" align="center">
          <IconButton
            variant="minimal"
            tone="neutral"
            size="small"
            icon={revealed ? eyeOffIcon : eyeIcon}
            label={revealed ? 'Hide token' : 'Show token'}
            onClick={() => setRevealed((r) => !r)}
          />
          <CopyButton text={token} label="Copy token" icon />
        </Stack>
      }
    />
  );
}
