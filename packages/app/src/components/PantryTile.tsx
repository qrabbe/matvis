import { Text } from '@wordpress/ui';
import { ProductThumb } from './ProductThumb';
import type { PantryTile as PantryTileData } from '../lib/pantry';

function weightLabel(quantity: number, unit: string): string {
  const amount = quantity.toLocaleString('sv-SE', { maximumFractionDigits: 3 });
  return `${amount} ${unit}`;
}

export function PantryTileCard({
  tile,
  done = false,
  finishedLabel,
  onTap,
  onOpenDetails,
}: {
  tile: PantryTileData;
  done?: boolean;
  finishedLabel?: string;
  onTap: () => void;
  onOpenDetails: () => void;
}) {
  const oldest = tile.outstandingUnits[0];
  const count = tile.outstandingUnits.length;
  const badge =
    !done && oldest && oldest.weightUnit
      ? weightLabel(oldest.quantity, oldest.weightUnit)
      : !done && count > 1
        ? `×${count}`
        : null;

  const ageFraction = Math.max(
    0,
    Math.min(1, 1 - tile.dueInDays / tile.typicalDurationDays),
  );

  return (
    <button
      type="button"
      onClick={done ? onOpenDetails : onTap}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenDetails();
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 6px 8px',
        borderRadius: 12,
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
        background: 'var(--wpds-color-background-surface-neutral-strong)',
        opacity: done ? 0.45 : 1,
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      {done && finishedLabel && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 6px',
            borderRadius: 999,
            background: 'var(--wpds-color-background-surface-neutral)',
            color: 'var(--wpds-color-foreground-content-neutral)',
          }}
        >
          ✓ {finishedLabel}
        </span>
      )}
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 6px',
            borderRadius: 999,
            background: 'var(--wpds-color-background-surface-neutral)',
            color: 'var(--wpds-color-foreground-content-neutral)',
          }}
        >
          {badge}
        </span>
      )}
      <ProductThumb product={tile.product} size={48} />
      <Text
        variant="body-sm"
        style={{
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {tile.name}
      </Text>
      {!done && (
        <div
          style={{
            width: '100%',
            height: 3,
            borderRadius: 2,
            background:
              'color-mix(in srgb, var(--wpds-color-foreground-content-neutral) 8%, transparent)',
          }}
        >
          <div
            style={{
              width: `${ageFraction * 100}%`,
              height: '100%',
              borderRadius: 2,
              background:
                tile.dueInDays < 0
                  ? 'var(--wpds-color-foreground-content-warning)'
                  : 'var(--wpds-color-foreground-interactive-brand)',
            }}
          />
        </div>
      )}
    </button>
  );
}
