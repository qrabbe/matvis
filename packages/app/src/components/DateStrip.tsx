import { useEffect, useRef } from 'react';
import { Text } from '@wordpress/ui';
import type { Trip } from '../lib/trips';
import { dayKey, formatKr } from '../lib/format';

const DOT_COLOR: Record<Trip['dotState'], string> = {
  green: 'var(--wpds-color-foreground-content-success)',
  orange: 'var(--wpds-color-foreground-content-warning)',
  red: 'var(--wpds-color-foreground-content-error)',
};

export function DateStrip({
  trips,
  itemsAtHome,
  selectedDay,
  onSelect,
}: {
  trips: readonly Trip[];
  itemsAtHome: number;
  selectedDay: string | null;
  onSelect: (day: string | null) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selectedDay]);

  // Oldest first so a selected date's past sits to its left and more
  // recent trips sit to its right.
  const oldestFirst = [...trips].reverse();

  return (
    <div
      ref={scrollerRef}
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        paddingBottom: 2,
      }}
    >
      {oldestFirst.map((trip) => {
        const day = dayKey(trip.purchasedAt);
        const selected = selectedDay === day;
        return (
          <button
            key={trip.receiptId}
            ref={selected ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(day)}
            style={cellStyle(selected)}
          >
            <Text variant="body-sm">
              {trip.purchasedAt.toLocaleDateString('sv-SE', {
                day: 'numeric',
                month: 'numeric',
              })}
            </Text>
            <Text variant="body-sm">{formatKr(trip.spend)}</Text>
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                margin: '2px auto 0',
                background: DOT_COLOR[trip.dotState],
                boxShadow: selected
                  ? '0 0 0 2px var(--wpds-color-background-surface-neutral)'
                  : 'none',
              }}
            />
          </button>
        );
      })}
      <button
        type="button"
        ref={selectedDay === null ? selectedRef : undefined}
        onClick={() => onSelect(null)}
        style={cellStyle(selectedDay === null)}
      >
        <Text variant="body-sm" style={{ fontWeight: 700 }}>
          All
        </Text>
        <Text variant="body-sm">{itemsAtHome}</Text>
      </button>
    </div>
  );
}

function cellStyle(selected: boolean): React.CSSProperties {
  return {
    flex: '0 0 auto',
    minWidth: selected ? 56 : 46,
    borderRadius: 10,
    padding: selected ? '8px 6px' : '5px 4px',
    textAlign: 'center',
    lineHeight: 1.3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    transform: selected ? 'scale(1.08)' : 'none',
    transition: 'transform 120ms ease, padding 120ms ease',
    border: `1px solid ${
      selected
        ? 'var(--wpds-color-stroke-interactive-brand)'
        : 'var(--wpds-color-stroke-surface-neutral)'
    }`,
    background: selected
      ? 'var(--wpds-color-background-interactive-brand-strong)'
      : 'var(--wpds-color-background-surface-neutral-strong)',
    color: selected
      ? 'var(--wpds-color-foreground-interactive-brand-strong)'
      : 'var(--wpds-color-foreground-content-neutral)',
    cursor: 'pointer',
  };
}
