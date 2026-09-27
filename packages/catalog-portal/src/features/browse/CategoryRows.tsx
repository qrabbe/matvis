import { Card, Icon, Link, Text } from '@wordpress/ui';
import { chevronRight } from '@wordpress/icons';
import { href } from '../../lib/route';

export type CategoryRowItem = {
  key: string;
  name: string;
  count?: number;
  path: string;
};

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--wpds-dimension-gap-sm)',
  minHeight: 44,
  padding: 'var(--wpds-dimension-padding-md) var(--wpds-dimension-padding-2xl)',
} as const;

function CategoryRow({
  item,
  isLast,
}: {
  item: CategoryRowItem;
  isLast: boolean;
}) {
  return (
    <Link
      href={href(item.path)}
      variant="unstyled"
      style={{
        ...ROW_STYLE,
        borderBottom: isLast
          ? undefined
          : '1px solid var(--wpds-color-stroke-surface-neutral-weak)',
      }}
    >
      <Text variant="body-md">{item.name}</Text>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--wpds-dimension-gap-xs)',
        }}
      >
        {item.count !== undefined && (
          <Text variant="body-sm">{item.count.toLocaleString()}</Text>
        )}
        <Icon icon={chevronRight} size={20} />
      </span>
    </Link>
  );
}

/** The "All N products" row and a level's children, as a `Card` of full-bleed
 * `Link` rows. Used for both a chain's front page and a category-with-children
 * screen — the front page just has no `allRow`. */
export function CategoryRows({
  allRow,
  rows,
}: {
  allRow?: { name: string; path: string };
  rows: CategoryRowItem[];
}) {
  const items: CategoryRowItem[] = allRow
    ? [{ key: 'all', ...allRow }, ...rows]
    : rows;

  return (
    <Card.Root>
      <Card.Content>
        <Card.FullBleed>
          {items.map((item, index) => (
            <CategoryRow
              key={item.key}
              item={item}
              isLast={index === items.length - 1}
            />
          ))}
        </Card.FullBleed>
      </Card.Content>
    </Card.Root>
  );
}
