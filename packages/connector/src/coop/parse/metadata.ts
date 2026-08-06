import type { Store, VatLine } from '@matvis/shared';

export interface CoopReceiptMetadata {
  store: Store;
  receiptNumber?: string;
  purchasedAt?: string;
  cashier?: string;
  receiptType?: string;
  total?: number;
  itemCount?: number;
  discountsTotal?: number;
  pointsAmount?: number;
  vat: VatLine[];
  loyaltyCardId?: string; // personal data
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? undefined : n;
}

function toIso(raw: string): string {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!m) return raw;
  return `${m[1]}T${m[2]}:${m[3] ?? '00'}`;
}

function valueAfter(line: string, label: string): string | undefined {
  return line.startsWith(label) ? line.slice(label.length).trim() : undefined;
}

export function parseCoopReceiptMetadata(text: string): CoopReceiptMetadata {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const store: Store = { name: lines[0] ?? 'Unknown' };
  const vat: VatLine[] = [];
  const meta: CoopReceiptMetadata = { store, vat };

  for (const line of lines) {
    const place = line.match(/^(\d{5})\s+(.+)$/);
    if (place && place[1] && place[2] && !store.postalCode) {
      store.postalCode = place[1];
      store.city = place[2];
      continue;
    }
    if (/^0[\d\s]*-[\d\s-]+$/.test(line) && !store.phone) {
      store.phone = line;
      continue;
    }
    if (line.includes('ekonomisk förening')) {
      store.legalEntity = line;
      continue;
    }
    if (/kassakvitto/i.test(line)) {
      meta.receiptType = line;
      continue;
    }

    const kvitto = valueAfter(line, 'Kvitto ');
    if (kvitto) {
      meta.receiptNumber = kvitto;
      continue;
    }
    const datum = valueAfter(line, 'Datum ');
    if (datum) {
      meta.purchasedAt = toIso(datum);
      continue;
    }
    const kassor = valueAfter(line, 'Kassör ');
    if (kassor) {
      meta.cashier = kassor;
      continue;
    }
    const orgNr = valueAfter(line, 'Org.Nr ');
    if (orgNr) {
      store.orgNr = orgNr;
      continue;
    }
    const total = valueAfter(line, 'Total SEK ');
    if (total) {
      meta.total = parseAmount(total);
      continue;
    }
    const count = valueAfter(line, 'Antal artiklar ');
    if (count) {
      const n = Number.parseInt(count, 10);
      if (!Number.isNaN(n)) meta.itemCount = n;
      continue;
    }
    const rabatter = valueAfter(line, 'Erhållna rabatter ');
    if (rabatter) {
      meta.discountsTotal = parseAmount(rabatter);
      continue;
    }
    const points = valueAfter(line, 'Poänggrundade belopp ');
    if (points) {
      meta.pointsAmount = parseAmount(points);
      continue;
    }
    const member = valueAfter(line, 'Medlemskort ');
    if (member) {
      meta.loyaltyCardId = member;
      continue;
    }

    const vatRow = line.match(
      /^(\d+)%\s+([\d\s,]+?)\s+([\d\s,]+?)\s+([\d\s,]+?)$/,
    );
    if (vatRow) {
      const rate = parseAmount(vatRow[1] ?? '');
      const v = parseAmount(vatRow[2] ?? '');
      const net = parseAmount(vatRow[3] ?? '');
      const gross = parseAmount(vatRow[4] ?? '');
      if (
        rate !== undefined &&
        v !== undefined &&
        net !== undefined &&
        gross !== undefined
      ) {
        vat.push({ rate, vat: v, net, gross });
      }
    }
  }

  return meta;
}
