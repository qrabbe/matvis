import { useQuery } from 'convex/react';
import { Badge, Card, Notice, Stack, Text } from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { InlineSpinner } from '../components/InlineSpinner';
import { api, type ConnectionPublic } from '../lib/convexApi';
import { formatDateTime } from '../lib/format';

/** How to render one connection's health, derived from its status and expiry.
 * `intent` maps to a `@wordpress/ui` Badge color and `note` explains the state. */
type Health = {
  label: string;
  intent: 'stable' | 'medium' | 'high';
  note: string;
};

/** Decide whether a connection is still valid, right now. `status` is the
 * server's truth. A refresh token past its expiry is effectively dead too
 * (nothing left to refresh with), so we surface that as "Expired". The access
 * token expiring is routine (it refreshes on the next sync), so it never counts
 * as invalid here. */
function health(c: ConnectionPublic, now: number): Health {
  if (c.status === 'revoked') {
    return {
      label: 'Revoked',
      intent: 'high',
      note: 'This link was revoked — re-link the store in the Connect tab to sync again.',
    };
  }
  if (c.status === 'needs_reauth') {
    return {
      label: 'Needs re-auth',
      intent: 'medium',
      note: 'The BankID session expired — re-link the store to resume syncing.',
    };
  }
  if (c.refreshTokenExpiresAt !== undefined && c.refreshTokenExpiresAt <= now) {
    return {
      label: 'Expired',
      intent: 'medium',
      note: 'The stored session has expired — re-link the store to resume syncing.',
    };
  }
  return { label: 'Active', intent: 'stable', note: 'Syncing normally.' };
}

/** The store connections reachable through a token (or, with none, the login
 * session): which stores are linked and whether each is still valid. Same
 * token-vs-session scoping as {@link ReceiptsPanel}, so a third-party service
 * holding the token sees exactly this. */
export function ConnectionsPanel({ token }: { token?: string } = {}) {
  const connections = useQuery(api.connections.list, token ? { token } : {}); // undefined = loading
  const now = Date.now();

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Connected stores</Card.Title>
      </Card.Header>
      <Card.Content>
        {connections === undefined ? (
          <InlineSpinner label="Loading connections…" />
        ) : connections.length === 0 ? (
          <Notice.Root intent="info">
            <Notice.Description>
              This token isn’t linked to any store connections.
            </Notice.Description>
          </Notice.Root>
        ) : (
          <Stack direction="column" gap="md">
            {connections.map((c) => (
              <ConnectionRow key={c._id} connection={c} now={now} />
            ))}
          </Stack>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function ConnectionRow({
  connection: c,
  now,
}: {
  connection: ConnectionPublic;
  now: number;
}) {
  const h = health(c, now);
  const lastSynced = formatDateTime(c.lastSyncedAt);
  const accessValidUntil = formatDateTime(c.accessTokenExpiresAt);
  const accessExpired = c.accessTokenExpiresAt <= now;

  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Text variant="body-md">{STORE_LABELS[c.store]}</Text>
        <Badge intent={h.intent}>{h.label}</Badge>
      </Stack>
      <Text variant="body-sm">{h.note}</Text>
      <Text variant="body-sm">
        {lastSynced ? `Last synced ${lastSynced}` : 'Never synced'}
        {' · '}
        {accessExpired
          ? 'access token expired (refreshes on next sync)'
          : `access token valid until ${accessValidUntil}`}
      </Text>
    </Stack>
  );
}
