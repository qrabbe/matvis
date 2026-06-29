import { STORES, type Store, type VatLine } from '@matvis/shared';
import { v, type Infer } from 'convex/values';

/** Compile-time equality guard: errors unless `A` and `B` are mutually assignable. */
type AssertEqual<A extends B, B extends A> = true;

// Store slug validator, derived from the canonical STORES list in
// @matvis/shared
export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));

/** A `connections.status` value. Shared by the schema and query returns. */
export const connectionStatusValidator = v.union(
  v.literal('active'),
  v.literal('needs_reauth'),
  v.literal('revoked'),
);

/** The status a sync run can leave a connection in (never `revoked`). */
export const syncStatusValidator = v.union(
  v.literal('active'),
  v.literal('needs_reauth'),
);

/** A `pendingLinks.status` value. Shared by the schema and query returns. */
export const pendingLinkStatusValidator = v.union(
  v.literal('pending'),
  v.literal('complete'),
  v.literal('failed'),
);

// ── Receipt shape ────────────────────────────────

/** The store identity object, matching the `receipts.store` schema column. */
export const storeObjectValidator = v.object({
  name: v.string(),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  phone: v.optional(v.string()),
  orgNr: v.optional(v.string()),
  legalEntity: v.optional(v.string()),
});

/** One VAT breakdown row, matching the `receipts.vat` element schema. */
export const vatLineValidator = v.object({
  rate: v.number(),
  vat: v.number(),
  net: v.number(),
  gross: v.number(),
});

// Guards fail the build if these validators drift from the shared zod contract
// (type-only, erased at runtime).
type _StoreMatches = AssertEqual<Infer<typeof storeObjectValidator>, Store>;
type _VatMatches = AssertEqual<Infer<typeof vatLineValidator>, VatLine>;

/** One receipt line to INSERT. `gtin` is filled by a later matching pass. */
export const receiptItemInsertValidator = v.object({
  text: v.string(),
  price: v.number(),
  isDiscount: v.boolean(),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
});

/** A full stored `receiptItems` document, as returned to a caller. `gtin` is
 * optional — a later matching pass fills it (its presence means "matched"). */
export const receiptItemDocValidator = v.object({
  _id: v.id('receiptItems'),
  _creationTime: v.number(),
  receiptId: v.id('receipts'),
  lineNo: v.number(),
  ...receiptItemInsertValidator.fields,
  gtin: v.optional(v.string()),
});

/** The content columns of a `receipts` row (no system fields, relations, or
 * `rawText`). Single source spread into the schema, `insertReceipt`, and the
 * header validator so the three can't drift. */
export const receiptContentFields = {
  source: storeValidator,
  externalId: v.string(),
  schemaVersion: v.number(),
  store: storeObjectValidator,
  receiptNumber: v.optional(v.string()),
  purchasedAt: v.optional(v.string()),
  purchasedAtMs: v.optional(v.number()),
  currency: v.string(),
  total: v.optional(v.number()),
  itemCount: v.optional(v.number()),
  discountsTotal: v.optional(v.number()),
  pointsAmount: v.optional(v.number()),
  vat: v.array(vatLineValidator),
  loyaltyCardId: v.optional(v.string()),
  pdfStorageId: v.optional(v.id('_storage')),
} as const;

/** A stored `receipts` header row (system fields + content, minus `rawText`),
 * as returned by `list` / `changes` / `getReceipt`. */
export const receiptHeaderValidator = v.object({
  _id: v.id('receipts'),
  _creationTime: v.number(),
  connectionId: v.id('connections'),
  accountId: v.id('accounts'),
  ...receiptContentFields,
  // `rawText` intentionally dropped from the header.
});
