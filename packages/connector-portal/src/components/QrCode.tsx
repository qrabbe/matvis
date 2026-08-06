import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({
  value,
  size = 240,
}: {
  value: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="BankID QR code"
      style={{ borderRadius: 12, background: '#fff', padding: 8 }}
    />
  );
}
