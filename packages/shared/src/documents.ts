import type { GenericId } from 'convex/values';
import type { ReceiptCore } from './receipt';
import type { CatalogItem } from './catalog';
import type { StoreSlug } from './stores';

/**
 * The stored-document shapes: a contract type plus the Convex system fields and
 * ids the deployments add around it. Every typed frontend facade reads these,
 * and hand-copying them is how the unguarded half of a facade drifts. The
 * function-signature layer stays per consumer, since what each frontend is
 * allowed to name is a per-frontend decision.
 */

/** A stored `receipts` header row, as the read API returns it: the contract's
 * {@link ReceiptCore} plus the ids and derived columns a deployment adds. */
export type ReceiptHeader = ReceiptCore & {
  _id: GenericId<'receipts'>;
  _creationTime: number;
  connectionId: GenericId<'connections'>;
  accountId: GenericId<'accounts'>;
  externalId: string;
  purchasedAtMs?: number;
  pdfStorageId?: GenericId<'_storage'>;
};

/** A full stored `receiptItems` document, as `getReceipt` returns it. */
export type ReceiptItemDoc = {
  _id: GenericId<'receiptItems'>;
  _creationTime: number;
  receiptId: GenericId<'receipts'>;
  lineNo: number;
  text: string;
  price: number;
  isDiscount: boolean;
  quantity?: number;
  unit?: string;
  gtin?: string;
};

/** A store connection minus its secrets, as `connections.list` returns it.
 * Expiry timestamps are epoch ms. The UI derives validity against the clock. */
export type ConnectionPublic = {
  _id: GenericId<'connections'>;
  _creationTime: number;
  store: StoreSlug;
  status: 'active' | 'needs_reauth' | 'revoked';
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt?: number;
  lastSyncedAt?: number;
};

/** A stored clean-catalog row as the read API returns it. */
export type CatalogRow = CatalogItem & {
  _id: GenericId<'catalog'>;
  _creationTime: number;
};
