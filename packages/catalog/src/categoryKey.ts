const SEGMENT_SEP = '\u0001';

export const OTHER_CATEGORY_KEY = `other${SEGMENT_SEP}`;

// Sorts above anything a folded segment can contain, so appending it to a
// branch's key closes a prefix range without cutting off a deeper category.
export const CATEGORY_KEY_CEILING = '￿';

// Swap å/ä/ö before normalize: NFD decomposes them into a/o plus a combining
// mark first, which sorts them like ASCII a/o instead of after z.
export function foldSwedish(value: string): string {
  const folded = value
    .toLowerCase()
    .replace(/å/g, '{')
    .replace(/ä/g, '|')
    .replace(/ö/g, '}');
  return folded.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function foldSegment(value: string): string {
  return foldSwedish(value.trim());
}

// Slug: lowercase, NFD-strip accents, collapse non-alphanumeric to hyphen.
export function slugSegment(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slugged = normalized.replace(/[^a-z0-9]+/g, '-');
  return slugged.replace(/^-+|-+$/g, '');
}

// A branch's key: every leaf under it starts with this, since each segment is
// terminated by SEGMENT_SEP. Valid for any path length, including a single
// top-level segment — unlike categoryKeyFor, which treats a lone segment as
// too little to be a real product's own category.
export function categoryKeyForPrefix(path: string[]): string {
  return (
    path.map((segment) => foldSwedish(segment.trim())).join(SEGMENT_SEP) +
    SEGMENT_SEP
  );
}

export function categoryKeyFor(categoryPath: string[] | undefined): string {
  if (!categoryPath || categoryPath.length === 0) return OTHER_CATEGORY_KEY;

  const trimmed = categoryPath.map((segment) => segment.trim());
  if (trimmed.some((segment) => segment.length === 0)) {
    return OTHER_CATEGORY_KEY;
  }
  if (trimmed.length < 2) return OTHER_CATEGORY_KEY;

  return categoryKeyForPrefix(trimmed);
}

export function searchTextFor(fields: {
  name: string;
  brand?: string;
  categoryPath?: string[];
}): string {
  const parts = [fields.name, fields.brand, ...(fields.categoryPath ?? [])];
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ');
}
