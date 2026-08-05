import { Skeleton, Stack, VisuallyHidden } from '@wordpress/ui';

const ROW_WIDTHS = ['100%', '84%', '92%', '76%'];

export function SkeletonList({
  label,
  rows = 3,
  rowHeight = 20,
}: {
  label: string;
  rows?: number;
  rowHeight?: number;
}) {
  return (
    <Stack direction="column" gap="sm" role="status" aria-busy>
      {/* Each `Skeleton` is `aria-hidden`, so the region carries the label. */}
      <VisuallyHidden>{label}</VisuallyHidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          style={{
            height: rowHeight,
            width: ROW_WIDTHS[index % ROW_WIDTHS.length],
            borderRadius: 4,
          }}
        />
      ))}
    </Stack>
  );
}
