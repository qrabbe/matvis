import { memo, useMemo, useState } from 'react';
import { Stack, Text, Tooltip } from '@wordpress/ui';
import { formatKr } from '../lib/format';
import { buildHeatmapGrid } from '../lib/heatmap';
import type { DailySpend } from '../lib/stats';
import { EMPTY_CELL, rampStep, SEQUENTIAL } from './chartTheme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CELL = 12;
const GAP = 3;

export function Heatmap({
  spendByDay,
  months = 6,
  todayMs,
}: {
  spendByDay: ReadonlyMap<string, DailySpend>;
  months?: number;
  todayMs: number;
}) {
  const { weeks, monthLabels } = useMemo(
    () => buildHeatmapGrid(new Date(todayMs), months),
    [months, todayMs],
  );

  const max = useMemo(() => {
    let peak = 0;
    for (const entry of spendByDay.values()) {
      if (entry.total > peak) peak = entry.total;
    }
    return peak;
  }, [spendByDay]);

  const labelByColumn = useMemo(
    () => new Map(monthLabels.map((m) => [m.column, m.label])),
    [monthLabels],
  );

  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  return (
    <Stack direction="column" gap="sm">
      <div
        data-heatmap
        style={{ overflowX: 'auto', paddingBottom: 4, position: 'relative' }}
        onPointerLeave={() => setHovered(null)}
      >
        <SharedTooltip hovered={hovered} />
        <Stack direction="column" gap="xs">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `28px repeat(${weeks.length}, ${CELL}px)`,
              gap: GAP,
              height: 14,
            }}
          >
            <span />
            {weeks.map((_, index) => (
              <Text
                key={index}
                variant="body-sm"
                style={{ fontSize: 10, whiteSpace: 'nowrap' }}
              >
                {labelByColumn.get(index) ?? ''}
              </Text>
            ))}
          </div>

          {WEEKDAYS.map((weekday, row) => (
            <div
              key={weekday}
              style={{
                display: 'grid',
                gridTemplateColumns: `28px repeat(${weeks.length}, ${CELL}px)`,
                gap: GAP,
                alignItems: 'center',
              }}
            >
              <Text variant="body-sm" style={{ fontSize: 10 }}>
                {row % 2 === 1 ? weekday : ''}
              </Text>
              {weeks.map((column, index) => {
                const day = column[row] ?? null;
                const entry = day ? spendByDay.get(day) : undefined;
                return (
                  <HeatCell
                    key={`${index}-${row}`}
                    day={day}
                    entry={entry}
                    max={max}
                    onHover={setHovered}
                  />
                );
              })}
            </div>
          ))}
        </Stack>
      </div>

      <Legend />
    </Stack>
  );
}

type HoveredCell = { description: string; left: number; top: number };

function SharedTooltip({ hovered }: { hovered: HoveredCell | null }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: hovered?.left ?? 0,
          top: hovered?.top ?? 0,
          width: CELL,
          height: CELL,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'default',
          visibility: hovered ? 'visible' : 'hidden',
        }}
      />
      <Tooltip.Popup>{hovered?.description ?? ''}</Tooltip.Popup>
    </Tooltip.Root>
  );
}

const HeatCell = memo(function HeatCell({
  day,
  entry,
  max,
  onHover,
}: {
  day: string | null;
  entry: DailySpend | undefined;
  max: number;
  onHover: (cell: HoveredCell) => void;
}) {
  if (!day) {
    return <span style={{ width: CELL, height: CELL }} />;
  }

  const total = entry?.total ?? 0;
  const description = entry
    ? `${day}: ${formatKr(total)} across ${entry.receipts} ${entry.receipts === 1 ? 'receipt' : 'receipts'}`
    : `${day}: nothing bought`;

  return (
    <span
      role="img"
      aria-label={description}
      onPointerEnter={(event) => {
        const cell = event.currentTarget.getBoundingClientRect();
        const wrapper =
          event.currentTarget.closest<HTMLElement>('[data-heatmap]');
        if (!wrapper) return;
        const bounds = wrapper.getBoundingClientRect();
        onHover({
          description,
          left: cell.left - bounds.left + wrapper.scrollLeft,
          top: cell.top - bounds.top + wrapper.scrollTop,
        });
      }}
      style={{
        width: CELL,
        height: CELL,
        borderRadius: 2,
        background: rampStep(total, max),
        display: 'block',
      }}
    />
  );
});

function Legend() {
  return (
    <Stack direction="row" gap="xs" align="center">
      <Text variant="body-sm" style={{ fontSize: 10 }}>
        Less
      </Text>
      <span
        style={{
          width: CELL,
          height: CELL,
          borderRadius: 2,
          background: EMPTY_CELL,
        }}
      />
      {SEQUENTIAL.map((color) => (
        <span
          key={color}
          style={{
            width: CELL,
            height: CELL,
            borderRadius: 2,
            background: color,
          }}
        />
      ))}
      <Text variant="body-sm" style={{ fontSize: 10 }}>
        More
      </Text>
    </Stack>
  );
}
