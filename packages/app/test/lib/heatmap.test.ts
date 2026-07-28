import { describe, expect, it } from 'bun:test';
import { dayKey } from '../../src/lib/format';
import { buildHeatmapGrid, mondayIndex } from '../../src/lib/heatmap';

const TODAY = new Date(2026, 6, 26); // Sunday 2026-07-26

/**
 * Build the grid in a child process under a given timezone. `TZ` cannot be
 * changed back once a process has read it, and bun test shares one process
 * across every file, so setting it here would leak into the other suites.
 */
function gridUnder(tz: string) {
  const module = new URL('../../src/lib/heatmap.ts', import.meta.url).href;
  const code = `const { buildHeatmapGrid } = await import(${JSON.stringify(module)});
    console.log(JSON.stringify(buildHeatmapGrid(new Date(2026, 6, 26), 6)));`;
  const proc = Bun.spawnSync(['bun', '-e', code], {
    env: { ...process.env, TZ: tz },
  });
  if (proc.exitCode !== 0) {
    throw new Error(proc.stderr.toString());
  }
  return JSON.parse(proc.stdout.toString()) as ReturnType<
    typeof buildHeatmapGrid
  >;
}

describe('buildHeatmapGrid', () => {
  it('starts every column on a Monday', () => {
    const { weeks } = buildHeatmapGrid(TODAY, 6);
    for (const column of weeks) {
      const first = column[0];
      if (!first) continue;
      expect(mondayIndex(new Date(`${first}T12:00:00`))).toBe(0);
    }
  });

  it('covers the requested span and ends on today', () => {
    const { weeks } = buildHeatmapGrid(TODAY, 6);
    const days = weeks.flat().filter((day) => day !== null);
    expect(days.at(-1)).toBe(dayKey(TODAY));
    expect(days).toContain('2026-01-26');
    // Six months back, rounded out to a Monday, is a little over 26 weeks.
    expect(weeks.length).toBeGreaterThanOrEqual(26);
  });

  it('emits every day once and in order', () => {
    const { weeks } = buildHeatmapGrid(TODAY, 6);
    const days = weeks.flat().filter((day) => day !== null);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
  });

  it('pads the trailing partial week rather than shortening it', () => {
    // A Wednesday, so the final column has four empty slots.
    const { weeks } = buildHeatmapGrid(new Date(2026, 6, 22), 6);
    for (const column of weeks) {
      expect(column).toHaveLength(7);
    }
    expect(weeks.at(-1)?.filter((day) => day === null)).toHaveLength(4);
  });

  it('never labels the same month twice', () => {
    const { monthLabels } = buildHeatmapGrid(TODAY, 6);
    expect(monthLabels.length).toBeGreaterThan(0);
    expect(new Set(monthLabels.map((m) => m.label)).size).toBe(
      monthLabels.length,
    );
  });

  it('produces the same month ruler west and east of Greenwich', () => {
    // Reading a day key as UTC midnight puts it on the previous day in a
    // negative-offset zone, which shifts every month label one column and one
    // month early and can duplicate or drop labels outright.
    const west = gridUnder('America/New_York');
    const east = gridUnder('Asia/Tokyo');
    expect(west.weeks).toEqual(east.weeks);
    expect(west.monthLabels).toEqual(east.monthLabels);
    expect(west.monthLabels.map((m) => m.column)).toEqual(
      buildHeatmapGrid(TODAY, 6).monthLabels.map((m) => m.column),
    );
  });
});
