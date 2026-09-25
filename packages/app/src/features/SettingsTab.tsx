import { useQuery } from 'convex/react';
import { Button, Text } from '@wordpress/ui';
import { CopyButton } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { useSettings } from '../hooks/useSettings';
import { api } from '../lib/convexApi';

function maskToken(token: string): string {
  if (token.length <= 6) return '…' + token;
  return `…${token.slice(-6)}`;
}

export function SettingsTab({
  token,
  onForgetToken,
}: {
  token: string | null;
  onForgetToken: () => void;
}) {
  const { targets, setTarget } = useSettings(token);
  const connections = useQuery(
    api.connections.list,
    token ? { token } : 'skip',
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
        }}
      >
        <Text variant="heading-md">Settings</Text>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
        <Section title="Daily targets">
          <div style={{ display: 'grid', gap: 0 }}>
            {targets.map((t) => (
              <div
                key={t.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom:
                    '1px solid var(--wpds-color-stroke-surface-neutral)',
                }}
              >
                <Text variant="body-sm">{t.label}</Text>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Text variant="body-sm" style={{ opacity: 0.7 }}>
                    {t.value} {t.unit}
                  </Text>
                  <Toggle
                    on={t.enabled}
                    onToggle={() =>
                      void setTarget(t.key, t.enabled ? null : undefined)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <Text variant="body-sm" style={{ opacity: 0.6, marginTop: 6 }}>
            Defaults for an average adult man. Tap a value to change it.
          </Text>
        </Section>

        <Section title="Data">
          <Row label="Tracking started" value="Not backfilled yet" />
          <Row
            label="Gram conversions"
            value="1 ml = 1 g (oil 0,92); eggs by EU size class"
          />
          <Row
            label="Export everything"
            value={
              token ? (
                <Button
                  size="compact"
                  variant="minimal"
                  onClick={() => exportData(token)}
                >
                  Download JSON
                </Button>
              ) : (
                '—'
              )
            }
          />
        </Section>

        <Section title="Access">
          <Row
            label="Account token"
            value={
              token ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Text variant="body-sm" style={{ opacity: 0.7 }}>
                    {maskToken(token)}
                  </Text>
                  <CopyButton text={token} />
                  <Button
                    size="compact"
                    variant="minimal"
                    onClick={onForgetToken}
                  >
                    Forget
                  </Button>
                </div>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Linked stores"
            value={
              connections === undefined
                ? '…'
                : connections.length === 0
                  ? 'None'
                  : connections.map((c) => STORE_LABELS[c.store]).join(', ')
            }
          />
        </Section>
      </div>
    </div>
  );
}

async function exportData(token: string): Promise<void> {
  const { appBackendApi } = await import('../lib/appBackendApi');
  const { appBackendClient } = await import('../lib/appBackendClient');
  const client = appBackendClient();
  if (!client) return;
  const marksExport = await client.query(appBackendApi.marks.exportAll, {
    token,
  });
  const blob = new Blob([JSON.stringify(marksExport, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'matvis-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Text
        variant="body-sm"
        style={{
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: 11,
          opacity: 0.6,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
        gap: 10,
      }}
    >
      <Text variant="body-sm">{label}</Text>
      {typeof value === 'string' ? (
        <Text variant="body-sm" style={{ opacity: 0.7, textAlign: 'right' }}>
          {value}
        </Text>
      ) : (
        value
      )}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        width: 30,
        height: 18,
        borderRadius: 9,
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
        background: on
          ? 'var(--wpds-color-background-interactive-brand-strong)'
          : 'var(--wpds-color-background-surface-neutral-strong)',
        position: 'relative',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 13 : 1,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: on
            ? 'var(--wpds-color-foreground-interactive-brand-strong)'
            : 'var(--wpds-color-foreground-content-neutral-weak)',
          transition: 'left 0.1s',
        }}
      />
    </button>
  );
}
