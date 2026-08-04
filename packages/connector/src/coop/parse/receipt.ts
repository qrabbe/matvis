import { Receipt } from '@matvis/shared';
import { extractPdfText } from './extract-pdf';
import { parseCoopReceiptMetadata } from './metadata';
import { parseCoopReceiptItems } from './items';

/** Options controlling how a Coop receipt is assembled. */
export interface ParseCoopReceiptOptions {
  /** Include the parsed loyalty/membership number ("Medlemskort") */
  includeLoyaltyCardId?: boolean;
  /** Attach the raw extracted text to `Receipt.rawText` for debugging. */
  includeRawText?: boolean;
}

/**
 * Assemble a validated {@link Receipt} from already-extracted receipt text
 */
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

/** Full pipeline: extract text from PDF bytes, then parse into a {@link Receipt}. */
export async function parseCoopReceiptPdf(
  bytes: Uint8Array,
  options: ParseCoopReceiptOptions = {},
): Promise<Receipt> {
  const text = await extractPdfText(bytes);
  return parseCoopReceipt(text, options);
}
