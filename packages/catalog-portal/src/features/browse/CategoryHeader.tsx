import { IconButton, Link, Stack, Text } from '@wordpress/ui';
import { chevronLeft } from '@wordpress/icons';
import { href } from '../../lib/route';

export type Ancestor = { name: string; path: string };

/** The back button, the name and the path-and-count line that top every
 * category and product-list screen. */
export function CategoryHeader({
  title,
  backPath,
  backLabel,
  ancestors,
  count,
}: {
  title: string;
  backPath: string;
  backLabel: string;
  ancestors: Ancestor[];
  count: number;
}) {
  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" align="center">
        <IconButton
          icon={chevronLeft}
          label={backLabel}
          render={<a href={href(backPath)} />}
        />
        <Text variant="heading-lg">{title}</Text>
      </Stack>
      <Text variant="body-sm">
        {ancestors.map((ancestor, index) => (
          <span key={ancestor.path}>
            <Link href={href(ancestor.path)}>{ancestor.name}</Link>
            {index < ancestors.length - 1 ? ' › ' : ' · '}
          </span>
        ))}
        {count.toLocaleString()} products
      </Text>
    </Stack>
  );
}
