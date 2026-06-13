import { useCallback, useState } from 'react';
import { useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Badge, Button, Card, Notice, Stack, Text } from '@wordpress/ui';
// Fallback: `@wordpress/ui` has no spinner (only `skeleton`) — see UI-component policy.
import { Spinner } from '@wordpress/components';
import { STORES, STORE_LABELS, type StoreSlug } from '@matvis/shared';
import { CopyButton } from '../components/CopyButton';
import { api, type Id } from '../lib/convexApi';
import {
  clearConnectionId,
  loadConnectionId,
  saveConnectionId,
} from '../lib/connectionStore';
import { errMsg } from '../lib/format';
import { pendingHint } from '../lib/bankid-copy';
import { useBankIdLink } from '../hooks/useBankIdLink';
import { QrCode } from '../components/QrCode';

/** Only `coop` has a built connector today; the rest are reserved slugs. */
const LIVE_STORES: readonly StoreSlug[] = ['coop'];

/**
 * Picker order: working stores first (only `coop` today), then the rest in
 * canonical market-share order. `STORES` itself stays market-share ordered —
 * this is display-only. `Array.sort` is stable, so each group keeps its order.
 */
const PICKER_STORES: readonly StoreSlug[] = [...STORES].sort(
  (a, b) => Number(!LIVE_STORES.includes(a)) - Number(!LIVE_STORES.includes(b)),
);

type SyncResult = FunctionReturnType<typeof api.sync.sync>;

export function ConnectPanel() {
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
    useBankIdLink(onComplete);

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
        {PICKER_STORES.map((slug) => {
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
              {STORE_LABELS[slug]}
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
  // Same-device is the primary path: on the phone you tap straight into the
  // BankID app (the deep link), so it leads. The QR is the fallback for when
  // you're on a desktop and scan with a phone. `appLink` arrives from
  // `links.start`'s autoStartToken, before the first `qr` from polling.
  return (
    <Stack direction="column" gap="md" align="center">
      {appLink ? (
        <>
          <Button
            variant="solid"
            tone="brand"
            render={<a href={appLink} />}
          >
            Open the BankID app on this device
          </Button>
          <Text variant="body-sm">
            On another device? Scan this with the BankID app instead:
          </Text>
          {qr ? <QrCode value={qr} /> : <Spinner />}
        </>
      ) : (
        <Stack direction="row" gap="sm" align="center">
          <Spinner />
          <Text variant="body-md">Starting BankID…</Text>
        </Stack>
      )}
      <Text variant="body-sm">{hint ?? pendingHint}</Text>
      <Button variant="minimal" tone="neutral" onClick={onCancel}>
        Cancel
      </Button>
    </Stack>
  );
}

function ConnectedView({
  connectionId,
  convex,
  onRelink,
}: {
  connectionId: string;
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
      });
      setResult(res);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [convex, connectionId]);

  return (
    <Stack direction="column" gap="md">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Badge intent="stable">Connected</Badge>
        <Text variant="body-sm">Connection {connectionId}</Text>
        <CopyButton text={connectionId} label="Copy id" />
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
