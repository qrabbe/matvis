import { useState } from 'react';
import { Text } from '@wordpress/ui';
import { sizedImageUrl } from '@matvis/ui';
import type { CatalogRow } from '@matvis/shared';
import { CHART_CHROME } from './chartTheme';

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
