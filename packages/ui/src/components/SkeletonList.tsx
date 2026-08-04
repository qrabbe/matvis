import { Skeleton, Stack, VisuallyHidden } from '@wordpress/ui';

/** Cycled row widths, so the placeholder reads as ragged rows of content rather
 * than one solid block. */
const ROW_WIDTHS = ['100%', '84%', '92%', '76%'];

/**
 * The standard content placeholder for a list or table loading into a layout we
 * already know the shape of. Prefer this to `InlineSpinner` there: it holds the
 * space, so the rows do not jump when they land. A spinner still belongs on
 * indeterminate progress and on action feedback.
 */
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
