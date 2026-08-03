import {
  STORES,
  type LineItem,
  type ReceiptCore,
  type ReceiptHeader,
  type ReceiptItemDoc,
  type Store,
  type VatLine,
} from '@matvis/shared';
import { v, type Infer } from 'convex/values';
import type { EncryptedSecret } from '../src/crypto';

/** True when `A` and `B` are mutually assignable. The tuple wrappers stop the
 * conditional from distributing over union members. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compile-time guard: `Assert<Equal<A, B>>` fails the build unless the two
 * match. Spelling it as a constraint on a concrete argument matters, because the
 * shorter `AssertEqual<A extends B, B extends A>` is a circular constraint that
 * TypeScript reports and then ignores, so it passes on any drift. */
type Assert<T extends true> = T;

/**
 * Line items one call will read for a single receipt. A real receipt runs to
 * tens of lines, so this is a guard against a malformed import rather than a
 * page anyone is expected to walk: every reader of a receipt's items uses it, so
 * none of them can turn into an unbounded read.
 */
export const MAX_RECEIPT_ITEMS = 1000;

/** A secret stored as AES-256-GCM ciphertext. See `src/crypto.ts`. */
export const encryptedSecretValidator = v.object({
  keyVersion: v.number(),
  iv: v.string(),
  ciphertext: v.string(),
});

type _EncryptedSecretMatches = Assert<
  Equal<Infer<typeof encryptedSecretValidator>, EncryptedSecret>
>;

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

/**
 * How one logged sync attempt settled. `running` is written on start and
 * replaced when the action returns or throws, so a row still reading `running`
 * long after `startedAt` is an attempt that died without settling (wall clock,
 * deploy). `needs_reauth` is its own outcome rather than an error because the
 * action returns normally there, having synced nothing.
 */
export const syncRunStatusValidator = v.union(
  v.literal('running'),
  v.literal('ok'),
  v.literal('needs_reauth'),
  v.literal('paused'),
  v.literal('error'),
);

/** How a settled run finished. Every state except the one it started in. */
export const syncRunOutcomeValidator = v.union(
  v.literal('ok'),
  v.literal('needs_reauth'),
  v.literal('paused'),
  v.literal('error'),
);

/** Longest error text kept on a run row, so one huge upstream message cannot
 * dominate the document. */
export const MAX_SYNC_ERROR_LENGTH = 500;

/** How long a run row is kept before a later run sweeps it. Long enough to
 * answer "did anything come in over the holidays", short enough that the table
 * does not grow forever behind a schedule. */
export const SYNC_RUN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Expired run rows deleted per new run. Bounded so opening a run costs the
 * same no matter how much backlog there is: the sweep only has to outpace the
 * rate rows expire, not clear a backlog in one go. */
export const SYNC_RUN_TRIM = 10;

/** What one sync attempt reports: receipts newly stored, receipts already known,
 * and the status it left the connection in. */
export const syncResultValidator = v.object({
  synced: v.number(),
  skipped: v.number(),
  status: syncStatusValidator,
});

/** Connections one scheduled dispatch will look at. A bound, not a page: the
 * schedule is daily, so a connection past the bound waits a day, and a household
 * has a handful of links rather than hundreds. */
export const SYNC_BATCH_LIMIT = 25;

/** How long a connection is left alone after a sync. Under a day, so a daily
 * schedule never skips the same connection twice, and long enough that an
 * evening manual sync stops the night's dispatch from repeating it. */
export const SYNC_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** Gap between the syncs one dispatch schedules. Every sync fetches and parses a
 * PDF per new receipt from a rate-limited API, so they go out in single file
 * rather than all at once. */
export const SYNC_STAGGER_MS = 2 * 60 * 1000;

/** A `connections` row minus its secrets, as the public read API returns it.
 * Access and refresh tokens are never exposed. The expiry timestamps are, so a
 * reader can judge validity (the caller derives "expired" against the clock). */
export const connectionPublicValidator = v.object({
  _id: v.id('connections'),
  _creationTime: v.number(),
  store: storeValidator,
  status: connectionStatusValidator,
  accessTokenExpiresAt: v.number(), // epoch ms
  refreshTokenExpiresAt: v.optional(v.number()), // epoch ms, absent = no expiry
  lastSyncedAt: v.optional(v.number()), // epoch ms
});

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
type _StoreMatches = Assert<Equal<Infer<typeof storeObjectValidator>, Store>>;
type _VatMatches = Assert<Equal<Infer<typeof vatLineValidator>, VatLine>>;

/** One receipt line to INSERT. `gtin` is filled by a later matching pass. */
export const receiptItemInsertValidator = v.object({
  text: v.string(),
  price: v.number(),
  isDiscount: v.boolean(),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
});

// The insert shape is the shared `LineItem` minus `gtin` (filled by the later
// matching pass), so guard it against that contract rather than letting the two
// drift apart.
type _LineItemMatches = Assert<
  Equal<Infer<typeof receiptItemInsertValidator>, Omit<LineItem, 'gtin'>>
>;

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

// The frontends read this row through the hand-written document types in
// @matvis/shared rather than through `Doc<'receiptItems'>`, so guard that copy
// too: an unguarded facade type is how a frontend drifts from the API.
type _ReceiptItemDocMatches = Assert<
  Equal<Infer<typeof receiptItemDocValidator>, ReceiptItemDoc>
>;

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

/** What this deployment adds on top of the contract's core: the store's own
 * receipt id, the ISO `purchasedAt` re-derived as epoch ms for range queries,
 * and the stored PDF. */
type ConnectorReceiptColumns = 'externalId' | 'purchasedAtMs' | 'pdfStorageId';

// Take those three away and what is left must be the shared core exactly, so a
// field added to either side fails the build until the other side moves too.
// Everything the contract carries but no column holds already lives outside
// `ReceiptCore`, which is why nothing has to be subtracted on that side.
type _ReceiptContentMatches = Assert<
  Equal<
    Omit<
      Infer<ReturnType<typeof v.object<typeof receiptContentFields>>>,
      ConnectorReceiptColumns
    >,
    ReceiptCore
  >
>;

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

// Same guard for the header the frontends type against.
type _ReceiptHeaderDocMatches = Assert<
  Equal<Infer<typeof receiptHeaderValidator>, ReceiptHeader>
>;
