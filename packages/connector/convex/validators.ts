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

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Assert<T extends true> = T;

export const MAX_RECEIPT_ITEMS = 1000;

export const encryptedSecretValidator = v.object({
  keyVersion: v.number(),
  iv: v.string(),
  ciphertext: v.string(),
});

type _EncryptedSecretMatches = Assert<
  Equal<Infer<typeof encryptedSecretValidator>, EncryptedSecret>
>;

// @matvis/shared
export const storeValidator = v.union(...STORES.map((slug) => v.literal(slug)));

export const connectionStatusValidator = v.union(
  v.literal('active'),
  v.literal('needs_reauth'),
  v.literal('revoked'),
);

export const syncStatusValidator = v.union(
  v.literal('active'),
  v.literal('needs_reauth'),
);

export const syncRunStatusValidator = v.union(
  v.literal('running'),
  v.literal('ok'),
  v.literal('needs_reauth'),
  v.literal('paused'),
  v.literal('error'),
);

export const syncRunOutcomeValidator = v.union(
  v.literal('ok'),
  v.literal('needs_reauth'),
  v.literal('paused'),
  v.literal('error'),
);

export const MAX_SYNC_ERROR_LENGTH = 500;

export const SYNC_RUN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SYNC_RUN_TRIM = 10;

export const syncResultValidator = v.object({
  synced: v.number(),
  skipped: v.number(),
  status: syncStatusValidator,
});

export const SYNC_BATCH_LIMIT = 25;

export const SYNC_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

export const SYNC_STAGGER_MS = 2 * 60 * 1000;

export const connectionPublicValidator = v.object({
  _id: v.id('connections'),
  _creationTime: v.number(),
  store: storeValidator,
  status: connectionStatusValidator,
  accessTokenExpiresAt: v.number(), // epoch ms
  refreshTokenExpiresAt: v.optional(v.number()), // epoch ms, absent = no expiry
  lastSyncedAt: v.optional(v.number()), // epoch ms
});

export const pendingLinkStatusValidator = v.union(
  v.literal('pending'),
  v.literal('complete'),
  v.literal('failed'),
);

export const storeObjectValidator = v.object({
  name: v.string(),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  phone: v.optional(v.string()),
  orgNr: v.optional(v.string()),
  legalEntity: v.optional(v.string()),
});

export const vatLineValidator = v.object({
  rate: v.number(),
  vat: v.number(),
  net: v.number(),
  gross: v.number(),
});

type _StoreMatches = Assert<Equal<Infer<typeof storeObjectValidator>, Store>>;
type _VatMatches = Assert<Equal<Infer<typeof vatLineValidator>, VatLine>>;

export const receiptItemInsertValidator = v.object({
  text: v.string(),
  price: v.number(),
  isDiscount: v.boolean(),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
});

type _LineItemMatches = Assert<
  Equal<Infer<typeof receiptItemInsertValidator>, Omit<LineItem, 'gtin'>>
>;

export const receiptItemDocValidator = v.object({
  _id: v.id('receiptItems'),
  _creationTime: v.number(),
  receiptId: v.id('receipts'),
  lineNo: v.number(),
  ...receiptItemInsertValidator.fields,
  gtin: v.optional(v.string()),
});

// @matvis/shared rather than through `Doc<'receiptItems'>`, so guard that copy
type _ReceiptItemDocMatches = Assert<
  Equal<Infer<typeof receiptItemDocValidator>, ReceiptItemDoc>
>;

export const receiptContentFields = {
  source: storeValidator,
  externalId: v.string(),
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

type ConnectorReceiptColumns = 'externalId' | 'purchasedAtMs' | 'pdfStorageId';

type _ReceiptContentMatches = Assert<
  Equal<
    Omit<
      Infer<ReturnType<typeof v.object<typeof receiptContentFields>>>,
      ConnectorReceiptColumns
    >,
    ReceiptCore
  >
>;

export const receiptHeaderValidator = v.object({
  _id: v.id('receipts'),
  _creationTime: v.number(),
  connectionId: v.id('connections'),
  accountId: v.id('accounts'),
  ...receiptContentFields,
});

type _ReceiptHeaderDocMatches = Assert<
  Equal<Infer<typeof receiptHeaderValidator>, ReceiptHeader>
>;
