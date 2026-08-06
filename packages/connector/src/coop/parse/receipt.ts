import { Receipt } from '@matvis/shared';
import { extractPdfText } from './extract-pdf';
import { parseCoopReceiptMetadata } from './metadata';
import { parseCoopReceiptItems } from './items';

export interface ParseCoopReceiptOptions {
  includeLoyaltyCardId?: boolean;
  includeRawText?: boolean;
}

export function parseCoopReceipt(
  text: string,
  options: ParseCoopReceiptOptions = {},
): Receipt {
  const meta = parseCoopReceiptMetadata(text);
  const items = parseCoopReceiptItems(text);

  return Receipt.parse({
    source: 'coop',
    store: meta.store,
    receiptNumber: meta.receiptNumber,
    purchasedAt: meta.purchasedAt,
    cashier: meta.cashier,
    receiptType: meta.receiptType,
    currency: 'SEK',
    total: meta.total,
    itemCount: meta.itemCount,
    discountsTotal: meta.discountsTotal,
    pointsAmount: meta.pointsAmount,
    vat: meta.vat,
    items,
    loyaltyCardId: options.includeLoyaltyCardId
      ? meta.loyaltyCardId
      : undefined,
    rawText: options.includeRawText ? text : undefined,
  });
}

export async function parseCoopReceiptPdf(
  bytes: Uint8Array,
  options: ParseCoopReceiptOptions = {},
): Promise<Receipt> {
  const text = await extractPdfText(bytes);
  return parseCoopReceipt(text, options);
}
