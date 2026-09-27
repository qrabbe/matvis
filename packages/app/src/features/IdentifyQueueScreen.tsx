import { Text } from '@wordpress/ui';
import { groupUnmapped } from '../lib/unmapped';
import type { PurchaseLine } from '../lib/purchases';
import { formatKr } from '../lib/format';

export interface IdentifyQueueScreenProps {
  lines: readonly PurchaseLine[];
  onSelectText: (text: string) => void;
  onClose: () => void;
}

export function IdentifyQueueScreen({
  lines,
  onSelectText,
  onClose,
}: IdentifyQueueScreenProps) {
  const unmapped = groupUnmapped(lines);
  const totalSpend = unmapped.reduce((sum, g) => sum + g.spend, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text variant="heading-md">To identify</Text>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--wpds-color-foreground-interactive-brand)',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ‹ Back
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        <Text variant="body-sm" style={{ opacity: 0.7, marginBottom: 8 }}>
          {unmapped.length} texts · {formatKr(totalSpend)}
        </Text>

        <div style={{ display: 'grid', gap: 10 }}>
          {unmapped.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectText(group.text)}
              style={{
                border: '1px solid var(--wpds-color-stroke-surface-neutral)',
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                background: 'var(--wpds-color-background-surface-neutral)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: 'var(--wpds-color-foreground-content-neutral)',
                  marginBottom: 4,
                  wordBreak: 'break-word',
                }}
              >
                {group.text}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  opacity: 0.7,
                }}
              >
                <span>
                  {group.count} line{group.count !== 1 ? 's' : ''}
                  {group.priceGroups.length > 1
                    ? ` · ${group.priceGroups.length} prices`
                    : ''}
                </span>
                <span>{formatKr(group.spend)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
