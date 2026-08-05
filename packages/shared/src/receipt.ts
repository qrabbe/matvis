import { z } from 'zod';
import { ReceiptSource } from './stores';

export const LineItem = z.object({
  text: z.string(),
  price: z.number(),
  /** Always true exactly when `price` is negative. */
  isDiscount: z.boolean().default(false),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  gtin: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItem>;

export const VatLine = z.object({
  rate: z.number(),
  vat: z.number(),
  net: z.number(),
  gross: z.number(),
});
export type VatLine = z.infer<typeof VatLine>;

export const Store = z.object({
  name: z.string(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  orgNr: z.string().optional(),
  legalEntity: z.string().optional(),
});
export type Store = z.infer<typeof Store>;

/** A field added here needs a matching column in the three shapes that assert
 * against it. Printed but unstored fields go on {@link Receipt} instead. */
export const ReceiptCore = z.object({
  source: ReceiptSource,
  store: Store,
  receiptNumber: z.string().optional(),
  purchasedAt: z.string().optional(),
  currency: z.string().default('SEK'),
  total: z.number().optional(),
  /** Article count as the store prints it, which excludes discount lines. */
  itemCount: z.number().optional(),
  discountsTotal: z.number().optional(),
  pointsAmount: z.number().optional(),
  vat: z.array(VatLine).default([]),
  /** Personal data. */
  loyaltyCardId: z.string().optional(),
});
export type ReceiptCore = z.infer<typeof ReceiptCore>;

export const Receipt = ReceiptCore.extend({
  items: z.array(LineItem),
  cashier: z.string().optional(),
  receiptType: z.string().optional(),
  rawText: z.string().optional(),
});
export type Receipt = z.infer<typeof Receipt>;

export const ReceiptSummary = z.object({
  id: z.string(),
  purchasedAt: z.string().optional(),
  place: z.string().optional(),
  amount: z.number().optional(),
});
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;
