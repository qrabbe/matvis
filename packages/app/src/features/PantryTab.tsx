import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Collapsible, Dialog, EmptyState, Text } from '@wordpress/ui';
import { DateStrip } from '../components/DateStrip';
import { PantryTileCard } from '../components/PantryTile';
import { ProductThumb } from '../components/ProductThumb';
import { useMarks } from '../hooks/useMarks';
import { formatKcal, formatKr } from '../lib/format';
import {
  groupPantryTiles,
  sortDueFirst,
  sortNewestFirst,
  sortOldestFirst,
  splitStaples,
  type PantryTile,
} from '../lib/pantry';
import { joinUnitsWithMarks, sortByPurchaseDate } from '../lib/pantryDetails';
import {
  expandLineToUnits,
  pantryGroupKey,
  unitMacros,
  type PantryUnit,
} from '../lib/pantryUnits';
import type { PurchaseLine } from '../lib/purchases';
import { groupTrips, type Trip } from '../lib/trips';

type SortMode = 'due-first' | 'oldest-first' | 'newest-first';

const SORT_LABELS: Record<SortMode, string> = {
  'due-first': 'Due first',
  'oldest-first': 'Oldest first',
  'newest-first': 'Newest first',
};

interface ToastState {
  unit: PantryUnit;
  tile: PantryTile;
  outcome: 'finished' | 'wasted';
  finishedAt: number;
  finishedAtHandSet: boolean;
  startedAt: number;
  kcal: number | null;
  menuOpen: boolean;
}

const TOAST_MS = 8000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toInputDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function PantryTab({
  lines,
  token,
  today = new Date(),
}: {
  lines: readonly PurchaseLine[];
  token: string | null;
  /** Injectable for deterministic tests; defaults to the real clock. */
  today?: Date;
}) {
  const { marks, mark, markMany, unmark, error } = useMarks(token);
  const [sortMode, setSortMode] = useState<SortMode>('due-first');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [staplesOpen, setStaplesOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [detailsGroupKey, setDetailsGroupKey] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tiles = useMemo(
    () => groupPantryTiles(lines, marks, today),
    [lines, marks, today],
  );
  const trips = useMemo(() => groupTrips(lines, marks), [lines, marks]);
  const { regular, staples } = splitStaples(tiles);

  const sortedRegular = useMemo(() => {
    if (sortMode === 'oldest-first') return sortOldestFirst(regular);
    if (sortMode === 'newest-first') return sortNewestFirst(regular);
    return sortDueFirst(regular);
  }, [regular, sortMode]);

  const itemsAtHome = tiles.reduce(
    (sum, tile) => sum + tile.outstandingUnits.length,
    0,
  );
  const toIdentifyCount = trips.reduce((sum, t) => sum + t.toIdentifyCount, 0);
  const toIdentifySpend = lines
    .filter((l) => !l.item.isDiscount && l.item.kind === undefined)
    .reduce((sum, l) => sum + l.item.price, 0);

  const selectedTrip: Trip | undefined = selectedDay
    ? trips.find(
        (t) => t.purchasedAt.toISOString().slice(0, 10) === selectedDay,
      )
    : undefined;

  const showToast = (unit: PantryUnit, tile: PantryTile) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const finishedAt = startOfDay(Date.now());
    const startedAt = unit.purchasedAt.getTime();
    const macros = unitMacros(unit);
    setToast({
      unit,
      tile,
      outcome: 'finished',
      finishedAt,
      finishedAtHandSet: false,
      startedAt,
      kcal: macros?.kcal ?? null,
      menuOpen: false,
    });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleTap = async (tile: PantryTile) => {
    const unit = tile.outstandingUnits[0];
    if (!unit) return;
    showToast(unit, tile);
    await mark({
      receiptId: unit.receiptId,
      lineNo: unit.lineNo,
      unitIndex: unit.unitIndex,
      outcome: 'finished',
      finishedAt: startOfDay(Date.now()),
      finishedAtHandSet: false,
      via: 'tap',
    });
  };

  const updateToastDate = async (
    field: 'startedAt' | 'finishedAt',
    value: string,
  ) => {
    if (!toast) return;
    const ms = new Date(`${value}T00:00:00`).getTime();
    if (!Number.isFinite(ms)) return;
    const next: ToastState = {
      ...toast,
      [field]: ms,
      finishedAtHandSet:
        field === 'finishedAt' ? true : toast.finishedAtHandSet,
    };
    setToast(next);
    await mark({
      receiptId: next.unit.receiptId,
      lineNo: next.unit.lineNo,
      unitIndex: next.unit.unitIndex,
      outcome: next.outcome,
      finishedAt: next.finishedAt,
      finishedAtHandSet: next.finishedAtHandSet,
      startedAt: next.startedAt,
      via: 'tap',
    });
  };

  const throwAway = async () => {
    if (!toast) return;
    await mark({
      receiptId: toast.unit.receiptId,
      lineNo: toast.unit.lineNo,
      unitIndex: toast.unit.unitIndex,
      outcome: 'wasted',
      finishedAt: toast.finishedAt,
      finishedAtHandSet: toast.finishedAtHandSet,
      startedAt: toast.startedAt,
      via: 'tap',
    });
    setToast(null);
  };

  const finishRest = async () => {
    if (!toast) return;
    const rest = toast.tile.outstandingUnits.slice(1);
    if (rest.length > 0) {
      await markMany({
        units: rest.map((u) => ({
          receiptId: u.receiptId,
          lineNo: u.lineNo,
          unitIndex: u.unitIndex,
        })),
        outcome: 'finished',
        finishedAt: toast.finishedAt,
        finishedAtHandSet: toast.finishedAtHandSet,
        via: 'trip',
      });
    }
    setToast(null);
  };

  const undo = async () => {
    if (!toast) return;
    await unmark({
      receiptId: toast.unit.receiptId,
      lineNo: toast.unit.lineNo,
      unitIndex: toast.unit.unitIndex,
    });
    setToast(null);
  };

  const markAllForTrip = async (trip: Trip) => {
    if (trip.outstandingUnits.length === 0) return;
    await markMany({
      units: trip.outstandingUnits.map((u) => ({
        receiptId: u.receiptId,
        lineNo: u.lineNo,
        unitIndex: u.unitIndex,
      })),
      outcome: 'finished',
      finishedAt: startOfDay(Date.now()),
      finishedAtHandSet: false,
      via: 'trip',
    });
  };

  const detailsTile = detailsGroupKey
    ? tiles.find((t) => t.groupKey === detailsGroupKey)
    : undefined;
  const detailsAllUnits = useMemo(
    () =>
      detailsGroupKey
        ? lines
            .filter((l) => !l.item.isDiscount)
            .flatMap((l) => expandLineToUnits(l))
            .filter((u) => pantryGroupKey(u) === detailsGroupKey)
        : [],
    [lines, detailsGroupKey],
  );
  const detailsStates = sortByPurchaseDate(
    joinUnitsWithMarks(detailsAllUnits, marks),
  ).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
        }}
      >
        <Text variant="heading-md">Pantry</Text>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 90px' }}>
        <div style={{ marginBottom: 8 }}>
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            {itemsAtHome} items at home
          </Text>
        </div>

        <DateStrip
          trips={trips}
          itemsAtHome={itemsAtHome}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
        />

        {error && (
          <Text
            variant="body-sm"
            style={{ color: 'var(--wpds-color-foreground-content-error)' }}
          >
            {error}
          </Text>
        )}

        {selectedTrip ? (
          <TripView
            trip={selectedTrip}
            onTapUnit={(unit) =>
              handleTap({
                ...emptyTileFor(unit),
                outstandingUnits: [unit],
              })
            }
            onMarkAll={() => markAllForTrip(selectedTrip)}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <Button
                  key={mode}
                  size="compact"
                  variant={sortMode === mode ? 'solid' : 'outline'}
                  onClick={() => setSortMode(mode)}
                >
                  {SORT_LABELS[mode]}
                </Button>
              ))}
            </div>

            {toIdentifyCount > 0 && (
              <div
                style={{
                  border:
                    '1px dashed var(--wpds-color-stroke-surface-neutral-strong)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  marginBottom: 10,
                }}
              >
                <Text variant="body-sm">
                  <strong>To identify · {toIdentifyCount}</strong>{' '}
                  {formatKr(toIdentifySpend)}
                </Text>
              </div>
            )}

            {staples.length > 0 && (
              <Collapsible.Root
                open={staplesOpen}
                onOpenChange={setStaplesOpen}
                style={{ marginBottom: 10 }}
              >
                <Collapsible.Trigger
                  render={
                    <button
                      type="button"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        background:
                          'var(--wpds-color-background-surface-neutral-strong)',
                        borderRadius: 10,
                        padding: '9px 12px',
                        cursor: 'pointer',
                      }}
                    />
                  }
                >
                  <Text variant="body-sm">
                    <strong>Cupboard staples · {staples.length}</strong>{' '}
                    {staplesOpen ? '▾' : '▸'}
                  </Text>
                </Collapsible.Trigger>
                <Collapsible.Panel>
                  <TileGrid
                    tiles={sortDueFirst(staples)}
                    onTap={handleTap}
                    onOpenDetails={setDetailsGroupKey}
                  />
                </Collapsible.Panel>
              </Collapsible.Root>
            )}

            {sortedRegular.length === 0 ? (
              <EmptyState.Root>
                <EmptyState.Title>Nothing in the pantry</EmptyState.Title>
                <EmptyState.Description>
                  Every purchase has been marked finished, or nothing has
                  resolved to a product yet.
                </EmptyState.Description>
              </EmptyState.Root>
            ) : (
              <TileGrid
                tiles={sortedRegular}
                onTap={handleTap}
                onOpenDetails={setDetailsGroupKey}
              />
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 64,
            background: 'var(--wpds-color-background-surface-neutral)',
            color: 'var(--wpds-color-foreground-content-neutral)',
            borderRadius: 14,
            padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text variant="body-sm" style={{ fontWeight: 700 }}>
              {toast.outcome === 'wasted' ? 'Thrown away' : 'Finished'} ·{' '}
              {toast.tile.name} ·{' '}
              {toast.kcal !== null ? formatKcal(toast.kcal) : 'not counted'}
            </Text>
            <button
              type="button"
              onClick={undo}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--wpds-color-foreground-interactive-brand)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Undo
            </button>
          </div>
          <div
            style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
          >
            <label style={chipLabelStyle}>
              Started
              <input
                type="date"
                value={toInputDate(toast.startedAt)}
                onChange={(e) => updateToastDate('startedAt', e.target.value)}
                style={chipInputStyle}
              />
            </label>
            <label style={chipLabelStyle}>
              Finished
              <input
                type="date"
                value={toInputDate(toast.finishedAt)}
                onChange={(e) => updateToastDate('finishedAt', e.target.value)}
                style={chipInputStyle}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setToast((t) => (t ? { ...t, menuOpen: !t.menuOpen } : t))
              }
              style={{ ...chipInputStyle, cursor: 'pointer' }}
            >
              ⋯
            </button>
          </div>
          {toast.menuOpen && (
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              <Button size="compact" variant="outline" onClick={throwAway}>
                Threw it away instead
              </Button>
              {toast.tile.outstandingUnits.length > 1 && (
                <Button size="compact" variant="outline" onClick={finishRest}>
                  Finish all {toast.tile.outstandingUnits.length}
                </Button>
              )}
              <Button
                size="compact"
                variant="outline"
                onClick={() => {
                  setDetailsGroupKey(toast.tile.groupKey);
                  setToast(null);
                }}
              >
                Details
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog.Root
        open={detailsGroupKey !== null}
        onOpenChange={(open) => !open && setDetailsGroupKey(null)}
      >
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>{detailsTile?.name ?? 'Details'}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content>
            <div style={{ display: 'grid', gap: 4 }}>
              {detailsStates.map(({ unit, mark: m }) => (
                <div
                  key={unit.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '7px 0',
                    borderBottom:
                      '1px solid var(--wpds-color-stroke-surface-neutral)',
                  }}
                >
                  <Text variant="body-sm">
                    {unit.purchasedAt.toLocaleDateString('sv-SE')}
                  </Text>
                  <Text variant="body-sm" style={{ opacity: 0.7 }}>
                    {m
                      ? `${m.outcome === 'wasted' ? 'thrown away' : 'finished'} ${new Date(m.finishedAt).toLocaleDateString('sv-SE')}`
                      : 'at home'}
                  </Text>
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Popup>
      </Dialog.Root>
    </div>
  );
}

function emptyTileFor(unit: PantryUnit): PantryTile {
  return {
    groupKey: pantryGroupKey(unit) ?? '',
    kind: (unit.line.item.kind as 'product' | 'produce') ?? 'product',
    gtin: unit.line.item.gtin,
    name: unit.line.product?.name ?? unit.line.item.text,
    product: unit.line.product,
    outstandingUnits: [unit],
    firstPurchase: unit.purchasedAt,
    lastPurchase: unit.purchasedAt,
    typicalDurationDays: 7,
    dueInDays: 0,
    isStaple: false,
  };
}

function TileGrid({
  tiles,
  onTap,
  onOpenDetails,
}: {
  tiles: readonly PantryTile[];
  onTap: (tile: PantryTile) => void;
  onOpenDetails: (groupKey: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {tiles.map((tile) => (
        <PantryTileCard
          key={tile.groupKey}
          tile={tile}
          onTap={() => onTap(tile)}
          onOpenDetails={() => onOpenDetails(tile.groupKey)}
        />
      ))}
    </div>
  );
}

function TripView({
  trip,
  onTapUnit,
  onMarkAll,
}: {
  trip: Trip;
  onTapUnit: (unit: PantryUnit) => void;
  onMarkAll: () => void;
}) {
  const groups = new Map<string, PantryUnit[]>();
  for (const unit of [...trip.outstandingUnits, ...trip.finishedUnits]) {
    const key = pantryGroupKey(unit);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(unit);
    else groups.set(key, [unit]);
  }
  const finishedKeys = new Set(trip.finishedUnits.map((u) => u.key));

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text variant="body-sm">
          {trip.header.store.name} ·{' '}
          {trip.purchasedAt.toLocaleDateString('sv-SE')}
        </Text>
        <Text variant="body-sm">{formatKr(trip.spend)}</Text>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {[...groups.entries()].map(([groupKey, units]) => {
          const done = units.every((u) => finishedKeys.has(u.key));
          const [oldest] = units;
          return (
            <button
              key={groupKey}
              type="button"
              onClick={() => !done && oldest && onTapUnit(oldest)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 6px',
                borderRadius: 12,
                border: '1px solid var(--wpds-color-stroke-surface-neutral)',
                opacity: done ? 0.45 : 1,
                cursor: done ? 'default' : 'pointer',
              }}
            >
              <ProductThumb product={oldest?.line.product ?? null} size={40} />
              <Text variant="body-sm">
                {oldest?.line.product?.name ?? oldest?.line.item.text}
              </Text>
            </button>
          );
        })}
      </div>
      {trip.outstandingUnits.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Button onClick={onMarkAll}>
            Mark all {trip.outstandingUnits.length} finished
          </Button>
        </div>
      )}
    </div>
  );
}

const chipLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
};

const chipInputStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, currentColor 12%, transparent)',
  border: 'none',
  borderRadius: 999,
  color: 'inherit',
  fontSize: 12,
  padding: '4px 8px',
};
