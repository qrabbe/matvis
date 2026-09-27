import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { Button, Link, Text } from '@wordpress/ui';
import { api } from '../lib/convexApi';
import { formatKr, isoWeekLabel } from '../lib/format';
import { groupTrips, type Trip } from '../lib/trips';
import { foldDiscounts } from '../lib/receiptLines';
import { unitKindLabel, unitMacros } from '../lib/pantryUnits';
import { joinUnitsWithMarks, sortByPurchaseDate } from '../lib/pantryDetails';
import { expandLineToUnits } from '../lib/pantryUnits';
import { formatKcal } from '../lib/format';
import { STORE_LABELS } from '@matvis/shared';
import { SpendingOverview } from '../components/SpendingOverview';
import { useMarks } from '../hooks/useMarks';
import type { PurchaseData } from '../hooks/usePurchaseData';

const DOT_COLOR: Record<Trip['dotState'], string> = {
  green: 'var(--wpds-color-foreground-content-success)',
  orange: 'var(--wpds-color-foreground-content-warning)',
  red: 'var(--wpds-color-foreground-content-error)',
};

type View =
  | { screen: 'list' }
  | { screen: 'detail'; receiptId: string }
  | { screen: 'chain'; receiptId: string; lineNo: number };

export function PurchasesTab({
  data,
  token,
  onOpenIdentify,
  today: todayProp,
}: {
  data: PurchaseData;
  token: string | null;
  onOpenIdentify?: () => void;
  today?: Date;
}) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const { marks } = useMarks(token);
  const [view, setView] = useState<View>({ screen: 'list' });

  const trips = useMemo(
    () => groupTrips(data.lines, marks),
    [data.lines, marks],
  );
  const toIdentifyCount = trips.reduce((sum, t) => sum + t.toIdentifyCount, 0);

  if (view.screen === 'detail') {
    return (
      <ReceiptDetail
        data={data}
        token={token}
        receiptId={view.receiptId}
        onBack={() => setView({ screen: 'list' })}
        onOpenChain={(lineNo) =>
          setView({ screen: 'chain', receiptId: view.receiptId, lineNo })
        }
      />
    );
  }

  if (view.screen === 'chain') {
    return (
      <LineChain
        data={data}
        marks={marks}
        receiptId={view.receiptId}
        lineNo={view.lineNo}
        onBack={() => setView({ screen: 'detail', receiptId: view.receiptId })}
      />
    );
  }

  const weeks = new Map<string, Trip[]>();
  for (const trip of trips) {
    const label = isoWeekLabel(trip.purchasedAt);
    const group = weeks.get(label);
    if (group) group.push(trip);
    else weeks.set(label, [trip]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text variant="heading-md">Purchases</Text>
        {toIdentifyCount > 0 && (
          <button
            type="button"
            onClick={onOpenIdentify}
            style={{
              background: 'var(--wpds-color-background-surface-neutral-strong)',
              border: '1px solid var(--wpds-color-stroke-surface-neutral)',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              color: 'var(--wpds-color-foreground-content-neutral)',
              cursor: onOpenIdentify ? 'pointer' : 'default',
            }}
          >
            To identify · {toIdentifyCount}
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
        <SpendingOverview headers={data.headers} today={today} />
        <Text
          variant="body-sm"
          style={{ display: 'block', opacity: 0.7, marginTop: 16 }}
        >
          {trips.length} receipts
        </Text>
        {[...weeks.entries()].map(([label, weekTrips]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <Text
              variant="body-sm"
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 11,
                opacity: 0.6,
                padding: '8px 0 4px',
              }}
            >
              {label}
            </Text>
            <div style={{ display: 'grid', gap: 8 }}>
              {weekTrips.map((trip) => (
                <TripRow
                  key={trip.receiptId}
                  trip={trip}
                  onOpen={() =>
                    setView({ screen: 'detail', receiptId: trip.receiptId })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TripRow({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'grid',
        gap: 4,
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
        background: 'var(--wpds-color-background-surface-neutral-strong)',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="body-sm">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              marginRight: 6,
              background: DOT_COLOR[trip.dotState],
            }}
          />
          <strong>{STORE_LABELS[trip.header.source]}</strong>{' '}
          {trip.header.store.name} ·{' '}
          {trip.purchasedAt.toLocaleDateString('sv-SE')}
        </Text>
        <Text variant="body-sm">{formatKr(trip.spend)}</Text>
      </div>
      {trip.toIdentifyCount > 0 && (
        <Text
          variant="body-sm"
          style={{ color: 'var(--wpds-color-foreground-content-warning)' }}
        >
          {trip.toIdentifyCount} to identify
        </Text>
      )}
    </button>
  );
}

function ReceiptDetail({
  data,
  token,
  receiptId,
  onBack,
  onOpenChain,
}: {
  data: PurchaseData;
  token: string | null;
  receiptId: string;
  onBack: () => void;
  onOpenChain: (lineNo: number) => void;
}) {
  const header = data.headers.find((h) => h._id === receiptId);
  const allLines = data.linesByReceipt.get(receiptId) ?? [];
  const foodLines = allLines.filter((l) => l.item.kind !== 'notFood');
  const folded = foldDiscounts(foodLines);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--wpds-color-foreground-interactive-brand)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ‹ Receipts
        </button>
        {header && (
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            {STORE_LABELS[header.source]}
          </Text>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {header && (
          <Text variant="body-sm" style={{ opacity: 0.7, marginBottom: 10 }}>
            {header.store.name} ·{' '}
            {new Date(
              header.purchasedAt ??
                header.purchasedAtMs ??
                header._creationTime,
            ).toLocaleString('sv-SE')}{' '}
            · paid {formatKr(header.total)} in total, incl. non-food
          </Text>
        )}

        <div style={{ display: 'grid', gap: 4 }}>
          {folded.map(({ line, netPrice }) => (
            <button
              key={line.item.lineNo}
              type="button"
              onClick={() => onOpenChain(line.item.lineNo)}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 8,
                textAlign: 'left',
                padding: '8px 0',
                border: 'none',
                borderBottom:
                  '1px solid var(--wpds-color-stroke-surface-neutral)',
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                <Text variant="body-sm">
                  {line.item.quantity && line.item.unit === 'st'
                    ? `${line.item.quantity} × `
                    : ''}
                  {line.product?.name ?? line.item.text}
                </Text>
                <Text
                  variant="body-sm"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    opacity: 0.6,
                  }}
                >
                  {line.item.text}
                  {line.item.quantity !== undefined && line.item.unit
                    ? ` · x${line.item.quantity} ${line.item.unit}`
                    : ''}
                </Text>
              </div>
              <Text variant="body-sm">{formatKr(netPrice)}</Text>
            </button>
          ))}
        </div>

        {folded.length === 0 && (
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            No food lines on this receipt.
          </Text>
        )}
      </div>

      <PdfLink receiptId={receiptId} token={token} />
    </div>
  );
}

function PdfLink({
  receiptId,
  token,
}: {
  receiptId: string;
  token: string | null;
}) {
  const url = useQuery(
    api.receipts.getPdf,
    token ? { receiptId: receiptId as never, token } : 'skip',
  );
  if (!url) return null;
  return (
    <div
      style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--wpds-color-stroke-surface-neutral)',
      }}
    >
      <Link href={url}>Show as printed (PDF)</Link>
    </div>
  );
}

function LineChain({
  data,
  marks,
  receiptId,
  lineNo,
  onBack,
}: {
  data: PurchaseData;
  marks: ReturnType<typeof useMarks>['marks'];
  receiptId: string;
  lineNo: number;
  onBack: () => void;
}) {
  const line = (data.linesByReceipt.get(receiptId) ?? []).find(
    (l) => l.item.lineNo === lineNo,
  );

  if (!line) {
    return (
      <div style={{ padding: 20 }}>
        <Button onClick={onBack}>‹ Back</Button>
      </div>
    );
  }

  const units = expandLineToUnits(line);
  const states = sortByPurchaseDate(joinUnitsWithMarks(units, marks));
  const outstanding = states.filter((s) => !s.mark).length;
  const finished = states.filter((s) => s.mark?.outcome === 'finished');
  const totalKcal = finished.reduce(
    (sum, s) => sum + (unitMacros(s.unit)?.kcal ?? 0),
    0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--wpds-color-foreground-interactive-brand)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ‹ Receipt
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <Text variant="heading-md">{line.product?.name ?? line.item.text}</Text>

        <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
          <ChainStep label="Printed" done>
            <Text
              variant="body-sm"
              style={{ fontFamily: 'monospace', opacity: 0.8 }}
            >
              {line.item.text}
              {line.item.quantity !== undefined && line.item.unit
                ? ` · x${line.item.quantity} ${line.item.unit}`
                : ''}
            </Text>
          </ChainStep>
          <ChainStep label="Parsed" done>
            <Text variant="body-sm">
              {units.length} unit{units.length !== 1 ? 's' : ''} ×{' '}
              {formatKr(line.item.price / units.length)}
            </Text>
          </ChainStep>
          <ChainStep label="Identified" done={line.item.kind !== undefined}>
            <Text variant="body-sm">
              {line.item.kind === undefined
                ? 'Not yet — identify'
                : line.product?.name
                  ? `${line.product.name} (${unitKindLabel(line.item.kind)})`
                  : unitKindLabel(line.item.kind)}
            </Text>
          </ChainStep>
          <ChainStep label="Pantry" done>
            <Text variant="body-sm">
              {outstanding} at home
              {finished.length > 0
                ? ` · finished ${finished
                    .map((s) =>
                      new Date(s.mark!.finishedAt).toLocaleDateString('sv-SE'),
                    )
                    .join(', ')}`
                : ''}
            </Text>
          </ChainStep>
          <ChainStep label="Counted" done={finished.length > 0}>
            <Text variant="body-sm">
              {finished.length > 0
                ? `${formatKcal(totalKcal)} so far`
                : 'not counted yet'}
            </Text>
          </ChainStep>
        </div>
      </div>
    </div>
  );
}

function ChainStep({
  label,
  done,
  children,
}: {
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '2px solid var(--wpds-color-stroke-interactive-brand)',
          background: done
            ? 'var(--wpds-color-stroke-interactive-brand)'
            : 'transparent',
        }}
      />
      <div style={{ display: 'grid', gap: 2 }}>
        <Text
          variant="body-sm"
          style={{
            textTransform: 'uppercase',
            fontSize: 10,
            letterSpacing: '0.06em',
            opacity: 0.6,
          }}
        >
          {label}
        </Text>
        {children}
      </div>
    </div>
  );
}
