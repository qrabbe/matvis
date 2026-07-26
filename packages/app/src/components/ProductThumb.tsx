import { useState } from 'react';
import { Text } from '@wordpress/ui';
import type { CatalogRow } from '../lib/catalogApi';
import { CHART_CHROME } from './chartTheme';

/**
 * Ask for a width-capped rendition of a catalog image.
 *
 * The catalog's projector normalizes Coop's images to
 * `…/image/upload/f_auto,q_auto/…`, which picks a web format but still serves
 * full resolution — around 1 MB a row, far too much for a list of thumbnails.
 * Cloudinary chains transform segments, so inserting `w_<width>/` keeps the
 * format choice and adds the size. Anything that is not a Cloudinary upload URL
 * is returned untouched.
 *
 * Duplicated from `catalog-portal/src/lib/images.ts` rather than shared: it is
 * six lines, and the alternative is a new cross-package dependency for them.
 * Noted as a candidate for `@matvis/ui` alongside the other duplicated pieces.
 */
export function sizedImageUrl(
  url: string | undefined,
  width: number,
): string | undefined {
  if (!url) return undefined;
  return url.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/i,
    `$1w_${width}/`,
  );
}

/**
 * A product image at a fixed size, falling back to a neutral tile with the
 * product's initial. The fallback is deliberately quiet: a missing image is
 * extremely common in the catalog and a loud placeholder would make a normal
 * row look like an error.
 */
export function ProductThumb({
  product,
  size = 48,
}: {
  product: CatalogRow | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : sizedImageUrl(product?.imageUrl, size * 2);

  const frame: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: 6,
    border: `1px solid ${CHART_CHROME.grid}`,
    background: CHART_CHROME.surface,
    objectFit: 'contain',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={frame}
      />
    );
  }

  return (
    <div style={frame} aria-hidden>
      <Text variant="body-sm">{product?.name?.[0]?.toUpperCase() ?? '?'}</Text>
    </div>
  );
}
