import { useCallback, useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Badge, Button, Card, Notice, Stack, Text } from '@wordpress/ui';
import { errMsg, STORE_LABELS, type ConnectionPublic } from '@matvis/shared';
import { ErrorNotice, SkeletonList } from '@matvis/ui';
import { api, type Id } from '../lib/convexApi';
import { formatDateTime } from '../lib/format';

type SyncResult = FunctionReturnType<typeof api.sync.sync>;

type Health = {
  label: string;
  intent: 'stable' | 'medium' | 'high';
  note: string;
};

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

export function ConnectionsPanel({ token }: { token?: string } = {}) {
  const connections = useQuery(api.connections.list, token ? { token } : {}); // undefined = loading
  const now = Date.now();
  const canSync = token === undefined;

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Connected stores</Card.Title>
      </Card.Header>
      <Card.Content>
        {connections === undefined ? (
          <SkeletonList label="Loading connections…" rowHeight={32} />
        ) : connections.length === 0 ? (
          <Notice.Root intent="info">
            <Notice.Description>
              {canSync
                ? 'No stores linked yet — link one above to start syncing receipts.'
                : 'This token isn’t linked to any store connections.'}
            </Notice.Description>
          </Notice.Root>
        ) : (
          <Stack direction="column" gap="md">
            {connections.map((c) => (
              <ConnectionRow
                key={c._id}
                connection={c}
                now={now}
                canSync={canSync}
              />
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
  canSync,
}: {
  connection: ConnectionPublic;
  now: number;
  canSync: boolean;
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
      {canSync && (
        <SyncNow connectionId={c._id} healthy={h.intent === 'stable'} />
      )}
    </Stack>
  );
}

function SyncNow({
  connectionId,
  healthy,
}: {
  connectionId: Id<'connections'>;
  healthy: boolean;
}) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsReauth = result?.status === 'needs_reauth';

  const sync = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await convex.action(api.sync.sync, { connectionId }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [convex, connectionId]);

  return (
    <Stack direction="column" gap="xs" align="start">
      {needsReauth && (
        <Notice.Root intent="warning">
          <Notice.Description>
            The stored BankID session expired. Link the store again to keep
            syncing.
          </Notice.Description>
        </Notice.Root>
      )}
      {error && <ErrorNotice title="Sync failed">{error}</ErrorNotice>}
      {result && !needsReauth && (
        <Text variant="body-sm">
          Synced {result.synced} new · skipped {result.skipped}
        </Text>
      )}
      <Button
        variant="outline"
        tone="neutral"
        loading={busy}
        disabled={!healthy}
        onClick={() => void sync()}
      >
        Sync now
      </Button>
    </Stack>
  );
}
