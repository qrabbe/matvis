import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text } from '@wordpress/ui';
import { useMutation } from 'convex/react';
import { catalogClient } from '../lib/catalogClient';
import { catalogApi } from '../lib/catalogApi';
import { api } from '../lib/convexApi';
import { useMarks } from '../hooks/useMarks';
import { normalizeForSearch, groupUnmapped } from '../lib/unmapped';
import { expandLineToUnits } from '../lib/pantryUnits';
import { formatKr } from '../lib/format';
import { ProductThumb } from '../components/ProductThumb';
import type { PurchaseLine } from '../lib/purchases';
import type { CatalogRow } from '@matvis/shared';

export interface IdentifyScreenProps {
  lines: readonly PurchaseLine[];
  selectedText: string;
  token: string | null;
  onBackToQueue: () => void;
}

interface ToastState {
  message: string;
  lineCount: number;
  canUndo: boolean;
  /** Units older than a week, offered as "Already finished? Mark N" —
   * never done automatically, one explicit extra tap. */
  staleUnits?: { receiptId: string; lineNo: number; unitIndex: number }[];
}

const STALE_AFTER_MS = 7 * 86_400_000;

export function IdentifyScreen({
  lines,
  selectedText,
  token,
  onBackToQueue,
}: IdentifyScreenProps) {
  const catalogClient_ = catalogClient();
  const { markMany } = useMarks(token);
  const linkMapping = useMutation(api.mappings.link);
  const unlinkMapping = useMutation(api.mappings.unlink);
  const [searchQuery, setSearchQuery] = useState(
    normalizeForSearch(selectedText),
  );
  const [candidates, setCandidates] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<number | undefined>();
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unmapped = useMemo(() => groupUnmapped(lines), [lines]);
  const currentGroup = useMemo(
    () => unmapped.find((g) => g.text === selectedText),
    [unmapped, selectedText],
  );

  const currentIndex = useMemo(
    () => unmapped.findIndex((g) => g.text === selectedText),
    [unmapped, selectedText],
  );

  const nextGroup = useMemo(
    () =>
      currentIndex >= 0 && currentIndex < unmapped.length - 1
        ? unmapped[currentIndex + 1]
        : null,
    [currentIndex, unmapped],
  );

  // Fetch store name from lines
  const storeName = useMemo(() => {
    const line = lines.find((l) => l.item.text === selectedText);
    return line?.header.store.name ?? 'Store';
  }, [lines, selectedText]);

  // Search catalog on query change
  useEffect(() => {
    if (!catalogClient_ || !searchQuery.trim()) {
      setCandidates([]);
      return;
    }

    setLoading(true);
    const load = async () => {
      try {
        const result = await catalogClient_.query(catalogApi.catalog.search, {
          q: searchQuery,
          paginationOpts: { numItems: 10, cursor: null },
        });
        setCandidates(result.page);
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [catalogClient_, searchQuery]);

  const linesForGroup = useMemo(
    () =>
      lines.filter((l) => l.item.text === selectedText && !l.item.isDiscount),
    [lines, selectedText],
  );

  const linesForPrice = useMemo(() => {
    if (selectedPrice === undefined) return linesForGroup;
    return linesForGroup.filter(
      (l) => Math.abs(l.item.price - selectedPrice) < 0.01,
    );
  }, [linesForGroup, selectedPrice]);

  const firstSeen = useMemo(() => {
    if (linesForGroup.length === 0) return new Date();
    return new Date(
      Math.min(...linesForGroup.map((l) => l.purchasedAt.getTime())),
    );
  }, [linesForGroup]);

  const handleLink = useCallback(
    async (
      kind: 'product' | 'produce' | 'notFood' | 'notInCatalog',
      gtin?: string,
    ) => {
      if (!token || !currentGroup || linesForPrice.length === 0) return;
      const store = linesForPrice[0]!.header.source;

      try {
        await linkMapping({
          token,
          store,
          text: selectedText,
          kind,
          gtin,
          price: selectedPrice,
        });

        const affectedLineCount = linesForPrice.length;
        const staleUnits =
          kind === 'product'
            ? linesForPrice
                .flatMap((l) => expandLineToUnits(l))
                .filter(
                  (u) => Date.now() - u.purchasedAt.getTime() > STALE_AFTER_MS,
                )
                .map(({ receiptId, lineNo, unitIndex }) => ({
                  receiptId,
                  lineNo,
                  unitIndex,
                }))
            : [];

        setToast({
          message: `Linked · ${affectedLineCount} line${affectedLineCount !== 1 ? 's' : ''} updated`,
          lineCount: affectedLineCount,
          canUndo: true,
          staleUnits: staleUnits.length > 0 ? staleUnits : undefined,
        });

        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => {
          setToast(null);
          if (nextGroup) {
            setSearchQuery(normalizeForSearch(nextGroup.text));
            onBackToQueue();
          }
        }, 2500);
      } catch (e) {
        console.error('Link failed:', e);
        setToast({
          message: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
          lineCount: 0,
          canUndo: false,
        });
      }
    },
    [
      token,
      currentGroup,
      selectedText,
      selectedPrice,
      linesForPrice,
      nextGroup,
      onBackToQueue,
      linkMapping,
    ],
  );

  const handleAlreadyFinished = useCallback(async () => {
    if (!toast?.staleUnits || toast.staleUnits.length === 0) return;
    await markMany({
      units: toast.staleUnits,
      outcome: 'finished',
      finishedAt: Date.now(),
      finishedAtHandSet: false,
      via: 'details',
    });
    setToast((t) => (t ? { ...t, staleUnits: undefined } : t));
  }, [toast, markMany]);

  const handleUndo = useCallback(async () => {
    if (!token || !currentGroup || linesForPrice.length === 0) return;
    const store = linesForPrice[0]!.header.source;

    try {
      await unlinkMapping({
        token,
        store,
        text: selectedText,
        price: selectedPrice,
      });

      setToast({ message: 'Undone', lineCount: 0, canUndo: false });
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [
    token,
    currentGroup,
    selectedText,
    selectedPrice,
    linesForPrice,
    unlinkMapping,
  ]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  if (!currentGroup) {
    return (
      <div style={{ padding: '20px' }}>
        <Text>Text not found</Text>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--wpds-color-stroke-surface-neutral)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onBackToQueue}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--wpds-color-foreground-interactive-brand)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: 0,
          }}
        >
          ‹ Back
        </button>
        <Text variant="body-sm" style={{ opacity: 0.7 }}>
          {currentIndex + 1} of {unmapped.length}
        </Text>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Header with receipt text and info */}
        <div style={{ display: 'grid', gap: 4 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '15px',
              fontWeight: 600,
              lineHeight: 1.3,
              wordBreak: 'break-word',
              color: 'var(--wpds-color-foreground-content-neutral)',
            }}
          >
            {selectedText}
          </div>
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            {storeName} · {currentGroup.count} line
            {currentGroup.count !== 1 ? 's' : ''} since{' '}
            {firstSeen.toLocaleDateString('sv-SE')} ·{' '}
            {formatKr(currentGroup.spend)}
          </Text>
        </div>

        {/* Price groups */}
        {currentGroup.priceGroups.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {currentGroup.priceGroups.map((pg) => (
              <button
                key={pg.price}
                type="button"
                onClick={() =>
                  setSelectedPrice(
                    selectedPrice === pg.price ? undefined : pg.price,
                  )
                }
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--wpds-color-stroke-surface-neutral)',
                  background:
                    selectedPrice === pg.price
                      ? 'var(--wpds-color-background-interactive-brand-strong-active)'
                      : 'var(--wpds-color-background-surface-neutral)',
                  color:
                    selectedPrice === pg.price
                      ? 'var(--wpds-color-foreground-interactive-brand)'
                      : 'var(--wpds-color-foreground-content-neutral)',
                  fontSize: '12px',
                  fontWeight: selectedPrice === pg.price ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {pg.price.toFixed(2)} kr · {pg.count}×
              </button>
            ))}
          </div>
        )}

        {/* Search box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--wpds-color-stroke-surface-neutral)',
            borderRadius: 10,
            padding: '7px 10px',
            background: 'var(--wpds-color-background-surface-neutral-strong)',
          }}
        >
          <span style={{ opacity: 0.5 }}>⌕</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search catalog"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--wpds-color-foreground-content-neutral)',
            }}
          />
        </div>

        {/* Candidates */}
        {loading ? (
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            Searching...
          </Text>
        ) : candidates.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {candidates.map((candidate) => (
              <button
                key={candidate.ean}
                type="button"
                onClick={() => handleLink('product', candidate.ean)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px minmax(0, 1fr) auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px',
                  border: '1px solid var(--wpds-color-stroke-surface-neutral)',
                  borderRadius: 10,
                  background: 'var(--wpds-color-background-surface-neutral)',
                  cursor: 'pointer',
                }}
              >
                <ProductThumb product={candidate} size={52} />
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--wpds-color-foreground-content-neutral)',
                      marginBottom: 2,
                    }}
                  >
                    {candidate.name}
                  </div>
                  <Text
                    variant="body-sm"
                    style={{ opacity: 0.7, fontSize: '11px' }}
                  >
                    {candidate.brand && `${candidate.brand} · `}
                    {candidate.packageSizeText &&
                      `${candidate.packageSizeText} · `}
                    {candidate.categoryPath?.at(-1)}
                  </Text>
                </div>
                <Button size="compact" variant="solid">
                  This
                </Button>
              </button>
            ))}
          </div>
        ) : searchQuery.trim() && !loading ? (
          <Text variant="body-sm" style={{ opacity: 0.7 }}>
            No candidates found
          </Text>
        ) : null}

        {/* Action buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <Button
            onClick={() => handleLink('produce')}
            variant="outline"
            size="compact"
          >
            Loose produce
          </Button>
          <Button
            onClick={() => handleLink('notFood')}
            variant="outline"
            size="compact"
          >
            Not food
          </Button>
          <Button
            onClick={() => handleLink('notInCatalog')}
            variant="outline"
            size="compact"
          >
            Not in catalog
          </Button>
          <Button onClick={onBackToQueue} variant="outline" size="compact">
            Skip for now
          </Button>
        </div>
      </div>

      {/* Toast */}
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
              {toast.message}
            </Text>
            {toast.canUndo && (
              <button
                type="button"
                onClick={handleUndo}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--wpds-color-foreground-interactive-brand)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px',
                  textDecoration: 'underline',
                }}
              >
                Undo
              </button>
            )}
          </div>
          {toast.staleUnits && toast.staleUnits.length > 0 && (
            <Button
              size="compact"
              variant="outline"
              style={{ marginTop: 8 }}
              onClick={() => void handleAlreadyFinished()}
            >
              Already finished? Mark {toast.staleUnits.length}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
