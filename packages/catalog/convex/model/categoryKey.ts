const SEGMENT_SEP = '\u0001';

export const OTHER_CATEGORY_KEY = `other${SEGMENT_SEP}`;

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

export function categoryKeyFor(categoryPath: string[] | undefined): string {
  if (!categoryPath || categoryPath.length === 0) return OTHER_CATEGORY_KEY;

  const trimmed = categoryPath.map((segment) => segment.trim());
  if (trimmed.some((segment) => segment.length === 0)) {
    return OTHER_CATEGORY_KEY;
  }
  if (trimmed.length < 2) return OTHER_CATEGORY_KEY;

  return trimmed.map(foldSwedish).join(SEGMENT_SEP) + SEGMENT_SEP;
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
