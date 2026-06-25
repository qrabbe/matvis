import { STORES, type Store, type VatLine } from '@matvis/shared';
import { v, type Infer } from 'convex/values';

/** Compile-time equality guard: errors unless `A` and `B` are mutually assignable. */
type AssertEqual<A extends B, B extends A> = true;

// Store slug validator, derived from the canonical STORES list in
// @matvis/shared so it can't drift from the zod ReceiptSource. Shared by the
// schema and by function argument validators.
export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));

/** A `connections.status` value. Shared by the schema and query returns. */
export const connectionStatusValidator = v.union(
  v.literal('active'),
  v.literal('needs_reauth'),
  v.literal('revoked'),
);

/** A `pendingLinks.status` value. Shared by the schema and query returns. */
export const pendingLinkStatusValidator = v.union(
  v.literal('pending'),
  v.literal('complete'),
  v.literal('failed'),
);

// ── Receipt shape (single source of truth) ────────────────────────────────
// These object validators mirror the `receipts` / `receiptItems` schema
// columns. They live here so both the sync engine (`model/receipts.ts`, which
// writes rows) and the public read API (`receipts.ts`, which returns them)
// describe the SAME shape — the header validator can't silently drift from
// what `insertReceipt` actually persists.

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

// These sub-objects are hand-mirrored from the shared zod contract. The guards
// below fail the build if either side drifts from the other (type-only — erased
// at runtime). `Receipt` header/items are intentionally reshaped for storage
// (system fields added, `rawText` dropped) so aren't checked here.
type _StoreMatches = AssertEqual<Infer<typeof storeObjectValidator>, Store>;
type _VatMatches = AssertEqual<Infer<typeof vatLineValidator>, VatLine>;

/** One receipt line to INSERT. `gtin`/`matchConfidence` are omitted here —
 * filled by a later matching pass (see `receiptItemDocValidator`). */
export const receiptItemInsertValidator = v.object({
  text: v.string(),
  price: v.number(),
  isDiscount: v.boolean(),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
});

/** A full stored `receiptItems` document, as returned to a caller. Includes
 * the system fields plus `gtin`/`matchConfidence`, which a later matching pass
 * fills — optional so a matched row doesn't fail returns-validation. */
export const receiptItemDocValidator = v.object({
  _id: v.id('receiptItems'),
  _creationTime: v.number(),
  receiptId: v.id('receipts'),
  lineNo: v.number(),
  ...receiptItemInsertValidator.fields,
  gtin: v.optional(v.string()),
  matchConfidence: v.optional(v.number()),
});

/** The content columns of a `receipts` row (everything except the system
 * fields, the `connectionId`/`accountId` relations, and the large `rawText`).
 * Single source of truth spread into the schema table, the `insertReceipt`
 * mutation args, and the returned header validator so the three can't drift. */
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

/** A stored `receipts` header row WITHOUT `rawText` (which can be large), as
 * returned to a caller by `list` / `changes` / `getReceipt`. Includes the
 * system fields. Built from the same content fields the schema uses. */
export const receiptHeaderValidator = v.object({
  _id: v.id('receipts'),
  _creationTime: v.number(),
  connectionId: v.id('connections'),
  accountId: v.id('accounts'),
  ...receiptContentFields,
  // `rawText` intentionally dropped from the header.
});
