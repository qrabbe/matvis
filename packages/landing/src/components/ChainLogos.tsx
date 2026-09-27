import type { Chain } from '../lib/chains';

export function ChainLogos({
  chains,
  cols,
}: {
  chains: Chain[];
  cols: number;
}) {
  return (
    <div
      className="logos"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {chains.map((chain) => (
        <span key={chain.slug} className="logo" title={chain.label}>
          <img src={chain.src} alt={chain.label} />
        </span>
      ))}
    </div>
  );
}
