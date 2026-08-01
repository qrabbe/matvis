import { useMemo, useState } from 'react';
import { Stack, Text, Tooltip } from '@wordpress/ui';
import { formatKr } from '../lib/format';
import { buildHeatmapGrid } from '../lib/heatmap';
import type { DailySpend } from '../lib/stats';
import { EMPTY_CELL, rampStep, SEQUENTIAL } from './chartTheme';

/**
 * The contribution-style spend calendar: one column per week, one row per
 * weekday, cell brightness by that day's spend.
 *
 * Not recharts — it has no calendar heatmap, and a plain grid of divs was
 * already the right answer in the old repo. It reads `chartTheme.ts` for its
 * ramp, so it and the bar charts stay one system rather than two.
 *
 * Brightness is on a **log₂** scale (see `rampStep`), which was a considered
 * choice worth preserving: grocery spend spans two orders of magnitude across
 * days, so a linear ramp paints every ordinary day the same dim step and leaves
 * one big shop as the only visible cell.
 *
 * This tab needs no product join — it reads receipt headers only — so it works
 * fully today, while the matching-dependent views wait.
 */

/** Weekday row labels, Monday-first (the Swedish convention). */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CELL = 12;
const GAP = 3;

export function Heatmap({
  spendByDay,
  months = 6,
  today = new Date(),
}: {
  spendByDay: ReadonlyMap<string, DailySpend>;
  /** How far back the calendar reaches. */
  months?: number;
  today?: Date;
}) {
  const { weeks, monthLabels } = useMemo(
    () => buildHeatmapGrid(today, months),
    [months, today],
  );

  const max = useMemo(() => {
    let peak = 0;
    for (const entry of spendByDay.values()) {
      if (entry.total > peak) peak = entry.total;
    }
    return peak;
  }, [spendByDay]);

  // By column, so the ruler is a lookup per week rather than a scan per week.
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
          {/* Month ruler, positioned by column so it tracks the grid exactly. */}
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
              {/* Only alternate rows are labelled — seven labels on a 12px grid
                  is denser than it is legible. */}
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

/** The hovered cell's text plus where to put the tooltip, in coordinates
 * relative to the scrolling grid wrapper. */
type HoveredCell = { description: string; left: number; top: number };

/**
 * The calendar's one and only tooltip.
 *
 * A `Tooltip.Root` per cell is 371 stores and contexts at the 12-month setting,
 * for text that is already on every cell's `aria-label`. Instead a single
 * invisible trigger is parked over whichever cell the pointer is on. It covers
 * only that cell, so the neighbours still receive their own `pointerenter` and
 * move it along, and because the pointer never leaves the trigger the popup
 * swaps text instead of closing and reopening between days.
 */
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

/** One day. The detail the old repo put in a `title` attribute is the cell's
 * `aria-label`, which is what reaches a screen reader; the shared tooltip shows
 * the same string to everyone else. */
function HeatCell({
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
}

/** Dim-to-bright key. Always present: the ramp encodes magnitude and a reader
 * cannot infer the direction from the cells alone. */
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
