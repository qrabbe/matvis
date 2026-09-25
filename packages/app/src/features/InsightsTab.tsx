import { useMemo, useState } from 'react';
import { Button, Text } from '@wordpress/ui';
import { Meter } from '../components/Meter';
import { Heatmap } from '../components/Heatmap';
import { useMarks } from '../hooks/useMarks';
import { useSettings } from '../hooks/useSettings';
import { dayKey, formatKcal, formatKr } from '../lib/format';
import { shiftDays } from '../lib/dateRange';
import {
  forecastByDay,
  markedIntakeByDay,
  proteinSources,
  sumMacros,
  wasteSummary,
} from '../lib/intake';
import { expandLinesToUnits } from '../lib/pantryUnits';
import { groupPantryTiles } from '../lib/pantry';
import { dailySpend, headlineStats } from '../lib/stats';
import type { PurchaseData } from '../hooks/usePurchaseData';

type Segment = 'nutrition' | 'spending';

export function InsightsTab({
  data,
  token,
}: {
  data: PurchaseData;
  token: string | null;
}) {
  const { marks } = useMarks(token);
  const { targets } = useSettings(token);
  const [segment, setSegment] = useState<Segment>('nutrition');
  const today = useMemo(() => new Date(), []);

  const unitsByKey = useMemo(() => {
    const units = expandLinesToUnits(data.lines);
    return new Map(units.map((u) => [u.key, u]));
  }, [data.lines]);

  const weekFrom = shiftDays(dayKey(today), -6);
  const weekTo = dayKey(today);

  const weekDays = useMemo(
    () =>
      markedIntakeByDay(marks, unitsByKey).filter(
        (d) => d.day >= weekFrom && d.day <= weekTo,
      ),
    [marks, unitsByKey, weekFrom, weekTo],
  );
  const weekTotal = useMemo(() => sumMacros(weekDays), [weekDays]);

  const tiles = useMemo(
    () => groupPantryTiles(data.lines, marks, today),
    [data.lines, marks, today],
  );
  const outstandingUnits = useMemo(
    () => tiles.flatMap((t) => t.outstandingUnits),
    [tiles],
  );
  const durationByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const tile of tiles) {
      for (const unit of tile.outstandingUnits)
        m.set(unit.key, tile.typicalDurationDays);
    }
    return m;
  }, [tiles]);

  const forecastDays = useMemo(
    () =>
      forecastByDay(
        outstandingUnits,
        (unit) => durationByKey.get(unit.key) ?? 7,
        today,
      ),
    [outstandingUnits, durationByKey, today],
  );

  const sources = useMemo(
    () => proteinSources(marks, unitsByKey, weekFrom, weekTo).slice(0, 4),
    [marks, unitsByKey, weekFrom, weekTo],
  );

  const monthFrom = dayKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const waste = useMemo(
    () => wasteSummary(marks, unitsByKey, monthFrom, weekTo),
    [marks, unitsByKey, monthFrom, weekTo],
  );

  const stats = useMemo(() => headlineStats(data.headers), [data.headers]);
  const spendByDay = useMemo(() => dailySpend(data.headers), [data.headers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
        }}
      >
        <Text variant="heading-md">Insights</Text>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button
            size="compact"
            variant={segment === 'nutrition' ? 'solid' : 'outline'}
            onClick={() => setSegment('nutrition')}
          >
            Nutrition
          </Button>
          <Button
            size="compact"
            variant={segment === 'spending' ? 'solid' : 'outline'}
            onClick={() => setSegment('spending')}
          >
            Spending
          </Button>
        </div>

        {segment === 'nutrition' ? (
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <Text
                variant="body-sm"
                style={{ fontWeight: 700, marginBottom: 8 }}
              >
                This week vs your targets
              </Text>
              <div style={{ display: 'grid', gap: 10 }}>
                {targets
                  .filter((t) => t.enabled)
                  .map((t) => {
                    const current =
                      t.key === 'energy'
                        ? weekTotal.kcal
                        : t.key === 'protein'
                          ? weekTotal.protein
                          : t.key === 'fat'
                            ? weekTotal.fat
                            : t.key === 'carbs'
                              ? weekTotal.carbs
                              : t.key === 'fiber'
                                ? weekTotal.fiber
                                : t.key === 'saturatedFat'
                                  ? weekTotal.saturatedFat
                                  : weekTotal.salt;
                    const violated =
                      t.key === 'fiber' ? current < t.value : current > t.value;
                    return (
                      <div key={t.key}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 2,
                          }}
                        >
                          <Text variant="body-sm">{t.label}</Text>
                          <Text variant="body-sm">
                            {Math.round(current)} / {t.value} {t.unit}
                          </Text>
                        </div>
                        <Meter
                          value={current}
                          max={t.value}
                          label={t.label}
                          fill={
                            violated
                              ? 'var(--wpds-color-foreground-content-warning)'
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
              </div>
              <Text variant="body-sm" style={{ opacity: 0.6, marginTop: 8 }}>
                Only what you've marked finished. This week reads low until its
                packages are finished — packages lasting two weeks or more make
                up a large share of most weeks, and they only count once they're
                gone.
              </Text>
            </div>

            <div>
              <Text
                variant="body-sm"
                style={{ fontWeight: 700, marginBottom: 8 }}
              >
                Energy per day
              </Text>
              <DayBars marked={weekDays} forecast={forecastDays} />
              <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                <Legend
                  color="var(--wpds-color-foreground-interactive-brand)"
                  label="Marked"
                />
                <Legend
                  color="var(--wpds-color-stroke-surface-neutral-strong)"
                  label="Forecast"
                />
              </div>
            </div>

            <div>
              <Text
                variant="body-sm"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                Protein came from
              </Text>
              {sources.length === 0 ? (
                <Text variant="body-sm" style={{ opacity: 0.6 }}>
                  Nothing marked finished this week yet.
                </Text>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {sources.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="body-sm">{s.name}</Text>
                      <Text variant="body-sm" style={{ opacity: 0.7 }}>
                        {Math.round(s.proteinG)} g
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Text
                variant="body-sm"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                Thrown away this month
              </Text>
              <Text variant="body-md">
                {formatKr(waste.kr)}
                {waste.items.length > 0 ? ` · ${waste.items.join(', ')}` : ''}
              </Text>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <StatBox label="Total spend" value={formatKr(stats.spend)} />
              <StatBox label="Receipts" value={String(stats.receipts)} />
              <StatBox
                label="Avg. basket"
                value={formatKr(stats.averageBasket)}
              />
              <StatBox label="Discounts" value={formatKr(stats.discounts)} />
            </div>
            <Heatmap spendByDay={spendByDay} todayMs={today.getTime()} />
          </div>
        )}
      </div>
    </div>
  );
}

function DayBars({
  marked,
  forecast,
}: {
  marked: { day: string; macros: { kcal: number } }[];
  forecast: { day: string; macros: { kcal: number } }[];
}) {
  const all = [...marked, ...forecast];
  const max = Math.max(1, ...all.map((d) => d.macros.kcal));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 80,
        overflowX: 'auto',
      }}
    >
      {marked.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${formatKcal(d.macros.kcal)}`}
          style={{
            flex: '0 0 10px',
            height: `${Math.max(2, (d.macros.kcal / max) * 100)}%`,
            borderRadius: '2px 2px 0 0',
            background: 'var(--wpds-color-foreground-interactive-brand)',
          }}
        />
      ))}
      {forecast.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${formatKcal(d.macros.kcal)} (forecast)`}
          style={{
            flex: '0 0 10px',
            height: `${Math.max(2, (d.macros.kcal / max) * 100)}%`,
            borderRadius: '2px 2px 0 0',
            background: 'var(--wpds-color-stroke-surface-neutral-strong)',
          }}
        />
      ))}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 2, background: color }}
      />
      <Text variant="body-sm" style={{ opacity: 0.7 }}>
        {label}
      </Text>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <Text variant="body-sm" style={{ opacity: 0.6 }}>
        {label}
      </Text>
      <Text variant="heading-md">{value}</Text>
    </div>
  );
}
