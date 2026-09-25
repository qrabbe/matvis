import { useState } from 'react';
import { Tabs, Text } from '@wordpress/ui';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { usePurchaseData } from './hooks/usePurchaseData';
import { PantryTab } from './features/PantryTab';
import { looksLikeToken, useApiToken } from './lib/tokenStore';
import { Card, InputControl, Link, Stack, Button } from '@wordpress/ui';

export function App() {
  const { token, setToken } = useApiToken();
  const data = usePurchaseData(token);
  const [activeTab, setActiveTab] = useState('pantry');

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {!token ? (
        <TokenGate onSubmit={setToken} />
      ) : (
        <>
          {data.error && (
            <ErrorNotice title="Something did not load">
              {data.error}
            </ErrorNotice>
          )}
          {(data.hydration.total > data.hydration.done ||
            data.loadingHeaders) && <InlineSpinner label="Loading receipts" />}

          <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Tabs.Panel value="pantry">
                <PantryTab lines={data.lines} token={token} />
              </Tabs.Panel>
              <Tabs.Panel value="insights">
                <div style={{ padding: '20px' }}>
                  <Text>Insights - Coming in step 06</Text>
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="purchases">
                <div style={{ padding: '20px' }}>
                  <Text>Purchases - Coming in step 07</Text>
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="settings">
                <div style={{ padding: '20px' }}>
                  <Text>Settings - Coming in step 07</Text>
                </div>
              </Tabs.Panel>
            </div>

            <Tabs.List
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                borderTop: '1px solid var(--wpds-color-border)',
                marginTop: 'auto',
              }}
            >
              <Tabs.Tab
                value="pantry"
                style={{
                  padding: '10px 2px 13px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color:
                    activeTab === 'pantry'
                      ? 'var(--wpds-color-primary)'
                      : 'var(--wpds-color-foreground-content-secondary)',
                  fontWeight: activeTab === 'pantry' ? 700 : 400,
                }}
              >
                Pantry
              </Tabs.Tab>
              <Tabs.Tab
                value="insights"
                style={{
                  padding: '10px 2px 13px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color:
                    activeTab === 'insights'
                      ? 'var(--wpds-color-primary)'
                      : 'var(--wpds-color-foreground-content-secondary)',
                  fontWeight: activeTab === 'insights' ? 700 : 400,
                }}
              >
                Insights
              </Tabs.Tab>
              <Tabs.Tab
                value="purchases"
                style={{
                  padding: '10px 2px 13px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color:
                    activeTab === 'purchases'
                      ? 'var(--wpds-color-primary)'
                      : 'var(--wpds-color-foreground-content-secondary)',
                  fontWeight: activeTab === 'purchases' ? 700 : 400,
                }}
              >
                Purchases
              </Tabs.Tab>
              <Tabs.Tab
                value="settings"
                style={{
                  padding: '10px 2px 13px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color:
                    activeTab === 'settings'
                      ? 'var(--wpds-color-primary)'
                      : 'var(--wpds-color-foreground-content-secondary)',
                  fontWeight: activeTab === 'settings' ? 700 : 400,
                }}
              >
                Settings
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>
        </>
      )}
    </div>
  );
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <div style={{ padding: '48px 20px' }}>
      <Card.Root>
        <Card.Header>
          <Card.Title>Connect your receipts</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Paste your account API token. Mint one in the{' '}
              <Link href="../connector/">connector portal</Link> under Connect -
              that is also where you link a store.
            </Text>
            <InputControl
              label="Account API token"
              description="Stored in this browser only. It grants read access to one account's receipts."
              value={value}
              onValueChange={setValue}
            />
            <Stack direction="row" gap="sm">
              <Button
                disabled={!looksLikeToken(value)}
                onClick={() => onSubmit(value)}
              >
                Use this token
              </Button>
            </Stack>
            <Text variant="body-sm">
              The app can only read. It never opens an auth session, so linking,
              syncing and every other write stay with the portal.
            </Text>
          </Stack>
        </Card.Content>
      </Card.Root>
    </div>
  );
}
