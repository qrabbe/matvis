import { useState } from 'react';
import { Stack, Text, Button } from '@wordpress/ui';
import { groupPantryTiles, splitStaples, sortDueFirst } from '../lib/pantry';
import type { PurchaseLine } from '../lib/purchases';
import { useMarks } from '../hooks/useMarks';

type SortMode = 'due-first' | 'oldest-first' | 'newest-first';

interface PantryTabProps {
  lines: readonly PurchaseLine[];
  token: string | null;
}

export function PantryTab({ lines, token }: PantryTabProps) {
  const { marks } = useMarks(token);
  const [sortMode, setSortMode] = useState<SortMode>('due-first');
  const today = new Date();

  const tiles = groupPantryTiles(lines, marks, today);
  const split = splitStaples(tiles);
  const regularTiles = sortDueFirst(split.regular);

  const itemCount = tiles.reduce(
    (sum, tile) => sum + tile.outstandingUnits.length,
    0,
  );

  return (
    <Stack direction="column" gap="lg" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '12px 14px' }}>
        <Text variant="heading-md">Pantry</Text>
        <Text variant="body-sm">{itemCount} items at home</Text>
      </div>

      <div style={{ padding: '0 14px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant={sortMode === 'due-first' ? 'solid' : 'outline'}
            onClick={() => setSortMode('due-first')}
          >
            Due first
          </Button>
        </div>
      </div>

      <div style={{ padding: '0 14px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
          }}
        >
          {regularTiles.map((tile) => (
            <div
              key={tile.groupKey}
              style={{
                borderRadius: '12px',
                backgroundColor: '#f0f0f0',
                padding: '12px',
              }}
            >
              <Text variant="body-sm">{tile.name}</Text>
              <Text variant="body-sm">
                {tile.outstandingUnits.length} units
              </Text>
            </div>
          ))}
        </div>
      </div>
    </Stack>
  );
}
