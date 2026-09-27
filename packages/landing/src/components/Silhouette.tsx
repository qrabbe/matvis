import type { ReactNode } from 'react';
import type { Product } from '../lib/products';

const FILL_LABEL = { fill: '#fff', opacity: 0.7 };

export function Silhouette({ shape, tint }: Product) {
  const fill = { fill: tint };
  const shapes: Record<Product['shape'], ReactNode> = {
    carton: (
      <>
        <path d="M14 8h12l4 7v25H10V15z" {...fill} />
        <rect x="14" y="22" width="12" height="9" rx="1" {...FILL_LABEL} />
      </>
    ),
    tub: (
      <>
        <rect x="7" y="13" width="26" height="4" rx="1" {...fill} />
        <path d="M9 17h22l-2 20H11z" {...fill} opacity=".85" />
        <rect x="14" y="22" width="12" height="7" rx="1" {...FILL_LABEL} />
      </>
    ),
    loaf: (
      <>
        <rect x="3" y="17" width="34" height="12" rx="6" {...fill} />
        <path
          d="M11 20l3 6M19 20l3 6M27 20l3 6"
          stroke="#fff"
          strokeOpacity=".5"
          strokeWidth="1.5"
        />
      </>
    ),
    block: <path d="M5 32 L31 14 L35 20 L35 32z" {...fill} />,
    box: (
      <>
        <rect x="11" y="6" width="18" height="32" rx="1" {...fill} />
        <rect x="14" y="12" width="12" height="7" rx="1" {...FILL_LABEL} />
      </>
    ),
    can: (
      <>
        <rect x="10" y="11" width="20" height="26" rx="3" {...fill} />
        <rect x="10" y="19" width="20" height="9" {...FILL_LABEL} />
      </>
    ),
    bag: (
      <>
        <path d="M10 9h20l3 29H7z" {...fill} />
        <circle cx="20" cy="25" r="5" {...FILL_LABEL} />
      </>
    ),
    jar: (
      <>
        <rect x="13" y="8" width="14" height="5" rx="1" fill="#555" />
        <rect x="10" y="13" width="20" height="25" rx="4" {...fill} />
        <rect x="13" y="20" width="14" height="8" rx="1" {...FILL_LABEL} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 40 44" className="silhouette" aria-hidden="true">
      {shapes[shape]}
    </svg>
  );
}
