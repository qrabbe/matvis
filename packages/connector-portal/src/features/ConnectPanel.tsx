import { useCallback, useState } from 'react';
import { useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Badge, Button, Card, Notice, Stack, Text } from '@wordpress/ui';
import { STORES, type StoreSlug } from '@matvis/shared';
import { api, type Id } from '../lib/convexApi';
import {
  clearConnectionId,
  loadConnectionId,
  saveConnectionId,
  useDevSubject,
} from '../lib/devSubject';
import { errMsg } from '../lib/format';
import { pendingHint } from '../lib/bankid-copy';
import { useBankIdLink } from '../hooks/useBankIdLink';
import { QrCode } from '../components/QrCode';

/** Only `coop` has a built connector today; the rest are reserved slugs. */
const LIVE_STORES: readonly StoreSlug[] = ['coop'];

type SyncResult = FunctionReturnType<typeof api.sync.sync>;

export function ConnectPanel() {
  const subject = useDevSubject();
  const convex = useConvex();

  const [store, setStore] = useState<StoreSlug>('coop');
  const [connectionId, setConnectionId] = useState<string | null>(() =>
    loadConnectionId(),
  );

  const onComplete = useCallback((id: string) => {
    saveConnectionId(id);
    setConnectionId(id);
  }, []);

  const { active, qr, hint, appLink, error, login, cancel, reset } =
    useBankIdLink(subject, onComplete);

  const relink = useCallback(() => {
    reset();
    clearConnectionId();
    setConnectionId(null);
  }, [reset]);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Connect a store</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          {error && (
            <Notice.Root intent="error">
              <Notice.Title>Something went wrong</Notice.Title>
              <Notice.Description>{error}</Notice.Description>
            </Notice.Root>
          )}

          {connectionId ? (
            <ConnectedView
              connectionId={connectionId}
              subject={subject}
              convex={convex}
              onRelink={relink}
            />
          ) : active ? (
            <LinkInProgressView
              qr={qr}
              hint={hint}
              appLink={appLink}
              onCancel={cancel}
            />
          ) : (
            <StorePickerView
              store={store}
              onStore={setStore}
              onLink={() => login(store)}
            />
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function StorePickerView({
  store,
  onStore,
  onLink,
}: {
  store: StoreSlug;
  onStore: (s: StoreSlug) => void;
  onLink: () => void;
}) {
  return (
    <Stack direction="column" gap="md" align="start">
      <Text variant="body-md">
        Link a grocery account with BankID to sync its receipts. Tokens are held
        server-side — nothing touches this browser.
      </Text>
      <Stack direction="row" gap="sm" wrap="wrap">
        {STORES.map((slug) => {
          const live = LIVE_STORES.includes(slug);
          const selected = slug === store;
          return (
            <Button
              key={slug}
              variant={selected ? 'solid' : 'outline'}
              tone={selected ? 'brand' : 'neutral'}
              disabled={!live}
              onClick={() => onStore(slug)}
            >
              {slug}
              {!live ? ' (coming soon)' : ''}
            </Button>
          );
        })}
      </Stack>
      <Button onClick={onLink}>Link with BankID</Button>
    </Stack>
  );
}

function LinkInProgressView({
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
      <Text variant="body-sm">{hint ?? pendingHint}</Text>
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

function ConnectedView({
  connectionId,
  subject,
  convex,
  onRelink,
}: {
  connectionId: string;
  subject: string;
  convex: ReturnType<typeof useConvex>;
  onRelink: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsReauth = result?.status === 'needs_reauth';

  const sync = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await convex.action(api.sync.sync, {
        connectionId: connectionId as Id<'connections'>,
        subject,
      });
      setResult(res);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [convex, connectionId, subject]);

  return (
    <Stack direction="column" gap="md">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Badge intent="stable">Connected</Badge>
        <Text variant="body-sm">Connection {connectionId}</Text>
      </Stack>

      {needsReauth && (
        <Notice.Root intent="warning">
          <Notice.Title>Re-link needed</Notice.Title>
          <Notice.Description>
            The stored BankID session expired. Link the store again to keep
            syncing.
          </Notice.Description>
        </Notice.Root>
      )}

      {error && (
        <Notice.Root intent="error">
          <Notice.Title>Sync failed</Notice.Title>
          <Notice.Description>{error}</Notice.Description>
        </Notice.Root>
      )}

      {result && !needsReauth && (
        <Text variant="body-sm">
          Synced {result.synced} new · skipped {result.skipped} · status{' '}
          {result.status}
        </Text>
      )}

      <Stack direction="row" gap="sm" wrap="wrap">
        <Button onClick={sync} loading={busy}>
          Sync now
        </Button>
        <Button variant="outline" tone="neutral" onClick={onRelink}>
          Re-link
        </Button>
      </Stack>
    </Stack>
  );
}
