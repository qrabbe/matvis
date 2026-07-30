import type { ReactNode } from 'react';

/**
 * The tile grid the stat rows sit in. `min` is the narrowest a tile may get
 * before the row reflows, so a row of six short numbers can pack tighter than a
 * row of four long ones.
 */
export function StatGrid({
  min = 180,
  children,
}: {
  min?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
