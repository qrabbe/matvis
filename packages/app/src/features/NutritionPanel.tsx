import { useMemo, useState } from 'react';
import {
  Card,
  EmptyState,
  Notice,
  SelectControl,
  Stack,
  Text,
} from '@wordpress/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CoverageMeter } from '../components/CoverageMeter';
import { DateRangePicker } from '../components/DateRangePicker';
import { MacroSplitBar } from '../components/MacroSplitBar';
import { ProductThumb } from '../components/ProductThumb';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { StatGrid } from '../components/StatGrid';
import { TrendBadge } from '../components/TrendBadge';
import {
  AXIS_PROPS,
  BAR_RADIUS,
  CHART_CHROME,
  PRIMARY_SERIES,
  TOOLTIP_STYLE,
} from '../components/chartTheme';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { dayAtIndex, daySeries } from '../lib/chartSeries';
import {
  inRange,
  precedingRange,
  presetRange,
  rangeLengthDays,
  type DateRange,
  type RangePresetId,
} from '../lib/dateRange';
import { formatGrams, formatKcal } from '../lib/format';
import {
  addMacros,
  CONSUMPTION_WINDOW_DAYS,
  MACRO_LABELS,
  MACRO_UNITS,
  PROTEIN_GOAL_G,
  scaleMacros,
  spreadOverWindow,
  ZERO_MACROS,
  type Macros,
  type MacroKey,
} from '../lib/nutrition';
import { relativeChange } from '../lib/stats';
import type { PurchaseLine } from '../lib/purchases';

/**
 * Nutrition over time, under the spreading model.
 *
 * The headline caveat is stated in the UI rather than buried here: these are
 * macros **bought**, smoothed over a fixed window, not macros eaten. The app
 * cannot know what was eaten — recording that is a write, and it has none. See
 * ticket 17.
 */
const MACRO_KEYS: MacroKey[] = ['kcal', 'protein', 'fat', 'carbs', 'sugars'];

const MACRO_OPTIONS = MACRO_KEYS.map((key) => ({
  label: MACRO_LABELS[key],
  value: key as string,
}));

/** One day's bucket of spread-out macros, plus the lines that fed it. */
interface DayBucket {
  day: string;
  macros: Macros;
  contributors: PurchaseLine[];
}

/**
 * Spread every scalable line across its consumption window and bucket by day.
 * Lines whose macros are `null` are skipped, never zero-filled — a zero would
 * silently drag every average down and make missing data look like a diet.
 */
function bucketByDay(lines: readonly PurchaseLine[]): Map<string, DayBucket> {
  const buckets = new Map<string, DayBucket>();
  for (const line of lines) {
    if (!line.macros) continue;
    for (const share of spreadOverWindow(line.purchasedAt, line.macros)) {
      const bucket = buckets.get(share.day) ?? {
        day: share.day,
        macros: ZERO_MACROS,
        contributors: [],
      };
      bucket.macros = addMacros(bucket.macros, share.macros);
      bucket.contributors.push(line);
      buckets.set(share.day, bucket);
    }
  }
  return buckets;
}

/** Total macros across a set of buckets. */
function totalMacros(buckets: Iterable<DayBucket>): Macros {
  let total = ZERO_MACROS;
  for (const bucket of buckets) total = addMacros(total, bucket.macros);
  return total;
}

export function NutritionPanel({ data }: { data: PurchaseData }) {
  const [macro, setMacro] = useState<MacroKey>('kcal');
  const [preset, setPreset] = useState<RangePresetId | null>('30d');
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const buckets = useMemo(() => bucketByDay(data.lines), [data.lines]);

  const earliest = useMemo(() => {
    let oldest: string | null = null;
    for (const day of buckets.keys()) {
      if (oldest === null || day < oldest) oldest = day;
    }
    return oldest ?? undefined;
  }, [buckets]);

  // Every day in the range, including the empty ones — a chart drawn only over
  // days with data silently rescales its axis and turns a gap into a dense week.
  const series = useMemo(
    () => daySeries(range, (day) => buckets.get(day)?.macros[macro] ?? 0),
    [buckets, macro, range],
  );

  const current = useMemo(
    () =>
      totalMacros(
        [...buckets.values()].filter((bucket) => inRange(bucket.day, range)),
      ),
    [buckets, range],
  );
  const previous = useMemo(() => {
    const before = precedingRange(range);
    return totalMacros(
      [...buckets.values()].filter((bucket) => inRange(bucket.day, before)),
    );
  }, [buckets, range]);

  // Plain objects rather than memos: both feed non-memoized StatCards, so
  // memoizing an object literal costs more than it saves.
  const perDay = scaleMacros(current, 1 / rangeLengthDays(range));
  const previousPerDay = scaleMacros(
    previous,
    1 / rangeLengthDays(precedingRange(range)),
  );

  if (data.coverage.nutritionLines === 0) {
    return (
      <Stack direction="column" gap="xl">
        <ModelNotice />
        <Card.Root>
          <Card.Content>
            <Stack direction="column" gap="md">
              <EmptyState.Root>
                <EmptyState.Title>No nutrition data yet</EmptyState.Title>
                <EmptyState.Description>
                  Nutrition needs a receipt line to resolve to a catalog product
                  with a nutrition table. Nothing fills the text → EAN map yet,
                  so nothing resolves. The Unmapped tab shows exactly which
                  products would unlock this.
                </EmptyState.Description>
              </EmptyState.Root>
              <CoverageMeter coverage={data.coverage} />
            </Stack>
          </Card.Content>
        </Card.Root>
      </Stack>
    );
  }

  const selectedBucket = selectedDay ? buckets.get(selectedDay) : undefined;

  return (
    <Stack direction="column" gap="xl">
      <ModelNotice />

      <Stack
        direction="row"
        gap="md"
        justify="space-between"
        wrap="wrap"
        align="end"
      >
        <DateRangePicker
          range={range}
          onChange={(next) => {
            setRange(next);
            setPreset(null);
            setSelectedDay(null);
          }}
          earliest={earliest}
          activePreset={preset}
          onPresetChange={setPreset}
        />
        <SelectControl
          label="Nutrient"
          size="compact"
          items={MACRO_OPTIONS}
          value={MACRO_OPTIONS.find((option) => option.value === macro)}
          onValueChange={(item) =>
            setMacro((item?.value as MacroKey) ?? 'kcal')
          }
        />
      </Stack>

      <StatGrid>
        <StatCard
          label="Energy / day"
          value={formatKcal(perDay.kcal)}
          trend={
            <TrendBadge
              change={relativeChange(perDay.kcal, previousPerDay.kcal)}
            />
          }
        />
        <StatCard
          label="Protein / day"
          value={formatGrams(perDay.protein)}
          goal={{
            current: perDay.protein,
            target: PROTEIN_GOAL_G,
            label: `Goal ${PROTEIN_GOAL_G} g — a placeholder, not advice`,
          }}
          trend={
            <TrendBadge
              change={relativeChange(perDay.protein, previousPerDay.protein)}
            />
          }
        />
        <StatCard label="Fat / day" value={formatGrams(perDay.fat)} />
        <StatCard label="Carbs / day" value={formatGrams(perDay.carbs)} />
      </StatGrid>

      <SectionCard title="Where the energy came from">
        <MacroSplitBar macros={current} />
      </SectionCard>

      <SectionCard title={`${MACRO_LABELS[macro]} per day`}>
        <Stack direction="column" gap="md">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              {/* Single series: the card title and axis name it, so no legend
                    and no per-nutrient hue. */}
              <BarChart
                data={series}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                onClick={(state) => {
                  // Resolve the clicked datum by index, not by axis label.
                  // The label omits the year, so two years of receipts put
                  // two different days under one label.
                  setSelectedDay(dayAtIndex(series, state?.activeIndex));
                }}
              >
                <CartesianGrid
                  stroke={CHART_CHROME.grid}
                  vertical={false}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  {...AXIS_PROPS}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  {...AXIS_PROPS}
                  width={56}
                  unit={` ${MACRO_UNITS[macro]}`}
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [
                    `${Math.round(Number(value))} ${MACRO_UNITS[macro]}`,
                    MACRO_LABELS[macro],
                  ]}
                />
                <Bar
                  dataKey="value"
                  fill={PRIMARY_SERIES}
                  radius={BAR_RADIUS}
                  maxBarSize={28}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Text variant="body-sm">
            Click a bar to see which products drove that day.
          </Text>
          {selectedBucket && (
            <DayDrilldown bucket={selectedBucket} macro={macro} />
          )}
        </Stack>
      </SectionCard>

      <SectionCard title="Coverage">
        <CoverageMeter coverage={data.coverage} />
      </SectionCard>
    </Stack>
  );
}

/** The model caveat, stated as a `Notice` on the tab itself. Users must not read
 * "what I ate" into what is really "what I bought, smoothed". */
function ModelNotice() {
  return (
    <Notice.Root intent="info">
      <Notice.Title>These are macros bought, not eaten</Notice.Title>
      <Notice.Description>
        {`Each purchase is spread evenly over ${CONSUMPTION_WINDOW_DAYS} days from the day it was bought — a bag of rice is not eaten in one sitting, and the app has no way to record when anything actually was. Read the numbers as a smoothed picture of buying, not as intake.`}
      </Notice.Description>
    </Notice.Root>
  );
}

/** Which products drove a clicked day, biggest contribution first. */
function DayDrilldown({
  bucket,
  macro,
}: {
  bucket: DayBucket;
  macro: MacroKey;
}) {
  const rows = useMemo(() => {
    const byProduct = new Map<
      string,
      { name: string; value: number; line: PurchaseLine }
    >();
    for (const line of bucket.contributors) {
      if (!line.macros || !line.product) continue;
      const key = line.product.ean;
      const share = line.macros[macro] / CONSUMPTION_WINDOW_DAYS;
      const existing = byProduct.get(key);
      if (existing) existing.value += share;
      else byProduct.set(key, { name: line.product.name, value: share, line });
    }
    return [...byProduct.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [bucket, macro]);

  if (rows.length === 0) return null;

  return (
    <Stack direction="column" gap="sm">
      <Text variant="body-md">{`${bucket.day} — top contributors`}</Text>
      {rows.map((row) => (
        <Stack
          key={row.name}
          direction="row"
          gap="md"
          justify="space-between"
          align="center"
        >
          <Stack
            direction="row"
            gap="sm"
            align="center"
            style={{ minWidth: 0 }}
          >
            <ProductThumb product={row.line.product} size={28} />
            <Text variant="body-sm">{row.name}</Text>
          </Stack>
          <Text variant="body-sm">
            {`${Math.round(row.value)} ${MACRO_UNITS[macro]}`}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}
