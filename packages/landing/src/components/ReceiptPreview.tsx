const RECEIPT: [string, string, boolean?][] = [
  ['YOGHURT VANILJ', '24,95'],
  ['STANDARDMJÖLK', '17,90', true],
  ['BAGUETTE SURDEG', '29,00'],
  ['EDAMER SKIVAD', '42,50'],
  ['SPAGHETTI', '18,95'],
];

function ReceiptRow({
  a,
  b,
  hi,
  strong,
}: {
  a: string;
  b: string;
  hi?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={['row', hi && 'hi', strong && 'strong']
        .filter(Boolean)
        .join(' ')}
    >
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
}

export function ReceiptPreview({ compact }: { compact?: boolean }) {
  const rows = RECEIPT.slice(0, compact ? 3 : 4);
  return (
    <div className={compact ? 'receipt compact' : 'receipt'}>
      <ReceiptRow a="COOP" b={compact ? '' : '27.09.2026'} />
      <hr />
      {rows.map(([a, b, hi]) => (
        <ReceiptRow key={a} a={a} b={b ?? ''} hi={hi} />
      ))}
      <hr />
      <ReceiptRow a="TOTALT" b={compact ? '71,85' : '114,35'} strong />
    </div>
  );
}
