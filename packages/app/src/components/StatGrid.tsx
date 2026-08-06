import type { ReactNode } from 'react';

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
