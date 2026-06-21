import { z } from 'zod';
import { ReceiptSource } from './stores';

/**
 * Versioned contract for a normalized purchase receipt. Fields are defined once
 * as zod schemas and the TypeScript types are inferred from them. The shape is
 * store-agnostic. Anything only some stores print is `.optional()`.
 */

/** Bumped when the {@link Receipt} shape changes in a breaking way. */
export const SCHEMA_VERSION = 1;

/**
 * A single printed line on the receipt. `gtin` stays empty for the connector
 * and is populated later by the catalog layer.
 */
export const LineItem = z.object({
  /** Raw description as printed, e.g. "PESTO PEPERONICO 32,95". */
  text: z.string(),
  /** Line price in the receipt currency. Negative for discounts/rebates. */
  price: z.number(),
  /** True when this line is a discount/rebate (negative price). */
  isDiscount: z.boolean().default(false),
  /** Parsed quantity when the line encodes one (e.g. "0.652 KG"). */
  quantity: z.number().optional(),
  /** Parsed unit when present, e.g. "KG" | "ST" | "L". */
  unit: z.string().optional(),
  /** GTIN/EAN, the cross-system join key. Populated later by the catalog. */
  gtin: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItem>;

/** One row of the VAT ("Moms") breakdown table printed at the foot of a receipt. */
export const VatLine = z.object({
  /** VAT rate as a percentage, e.g. 12 for "12%". */
  rate: z.number(),
  /** VAT amount ("Belopp"). */
  vat: z.number(),
  /** Net amount ("Netto"). */
  net: z.number(),
  /** Gross amount ("Brutto"). */
  gross: z.number(),
});
export type VatLine = z.infer<typeof VatLine>;

/** Store / point-of-sale identity, as far as it is printed on the receipt. */
export const Store = z.object({
  /** Store name, e.g. "Stora Coop Location". */
  name: z.string(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  /** Swedish organisation number ("Org.Nr"). */
  orgNr: z.string().optional(),
  /** Legal entity line, e.g. "Coop Region ekonomisk förening". */
  legalEntity: z.string().optional(),
});
export type Store = z.infer<typeof Store>;

/** A fully normalized receipt. */
export const Receipt = z.object({
  /** Contract version this document was produced against. */
  schemaVersion: z.number().default(SCHEMA_VERSION),
  source: ReceiptSource,
  store: Store,
  /** Receipt number ("Kvitto"), e.g. "100000-001-00001". */
  receiptNumber: z.string().optional(),
  /** Purchase timestamp ("Datum") as an ISO 8601 string when parseable. */
  purchasedAt: z.string().optional(),
  /** Cashier id ("Kassör"). */
  cashier: z.string().optional(),
  /** Receipt type line, e.g. "Elektroniskt kassakvitto". */
  receiptType: z.string().optional(),
  /** ISO 4217 currency code. Coop receipts are SEK. */
  currency: z.string().default('SEK'),
  /** Grand total ("Total SEK"). */
  total: z.number().optional(),
  /** Article count as printed ("Antal artiklar"). Excludes discount lines. */
  itemCount: z.number().optional(),
  /** Sum of discounts ("Erhållna rabatter"), when printed. */
  discountsTotal: z.number().optional(),
  /** Points-earning amount ("Poänggrundade belopp"). */
  pointsAmount: z.number().optional(),
  /** VAT breakdown rows ("Moms" table). */
  vat: z.array(VatLine).default([]),
  /** Itemized purchase lines (products + discount lines). */
  items: z.array(LineItem),
  /** Loyalty/membership card number ("Medlemskort"). Personal data. */
  loyaltyCardId: z.string().optional(),
  /** The raw extracted PDF text, kept for debugging/re-parsing. */
  rawText: z.string().optional(),
});
export type Receipt = z.infer<typeof Receipt>;
