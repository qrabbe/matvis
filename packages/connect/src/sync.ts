import type { Receipt, TokenSet } from '@matvis/shared';
import { isAccessTokenValid, refreshBankId } from './coop/auth/bankid';
import { parseCoopReceiptPdf } from './coop/parse/receipt';
import { fetchReceiptPdf } from './coop/receipts/pdf';
import { listReceipts } from './coop/receipts/list';
import type { FetchLike } from './http';

// The runtime-agnostic sync engine. It orchestrates list → fetch PDF → parse →
// dedup → store for one linked connection, talking to injected ports only (a
// `FetchLike` transport and a small DB port). That keeps it unit-testable with
// stub deps and lets the Convex action in `convex/sync.ts` stay a thin adapter
// — so flipping that action to `"use node";` never touches this logic.

/** One receipt line, mapped to the connector's `receiptItems` shape. */
export interface ReceiptItemRow {
  text: string;
  price: number;
  isDiscount: boolean;
  quantity?: number;
  unit?: string;
  // `gtin` is intentionally absent — matching is a separate later pass.
}

/** A parsed receipt, mapped to the connector's `receipts` header + items. */
export interface ReceiptRow {
  externalId: string;
  schemaVersion: number;
  store: Receipt['store'];
  receiptNumber?: string;
  purchasedAt?: string;
  purchasedAtMs?: number;
  currency: string;
  total?: number;
  itemCount?: number;
  discountsTotal?: number;
  pointsAmount?: number;
  vat: Receipt['vat'];
  loyaltyCardId?: string;
  rawText?: string;
  items: ReceiptItemRow[];
}

/**
 * Map a parsed {@link Receipt} to the connector's storage row. Pure: no I/O.
 * `cashier`/`receiptType` are dropped (no schema column); `gtin` is omitted from
 * items (filled by the later matching pass); `purchasedAtMs` is derived from the
 * ISO `purchasedAt`, guarding an unparseable date to `undefined`.
 */
export function mapReceiptToRow(receipt: Receipt, externalId: string): ReceiptRow {
  const ms = receipt.purchasedAt ? Date.parse(receipt.purchasedAt) : NaN;
  return {
    externalId,
    schemaVersion: receipt.schemaVersion,
    store: receipt.store,
    receiptNumber: receipt.receiptNumber,
    purchasedAt: receipt.purchasedAt,
    purchasedAtMs: Number.isNaN(ms) ? undefined : ms,
    currency: receipt.currency,
    total: receipt.total,
    itemCount: receipt.itemCount,
    discountsTotal: receipt.discountsTotal,
    pointsAmount: receipt.pointsAmount,
    vat: receipt.vat,
    loyaltyCardId: receipt.loyaltyCardId,
    rawText: receipt.rawText,
    items: receipt.items.map((it) => ({
      text: it.text,
      price: it.price,
      isDiscount: it.isDiscount,
      quantity: it.quantity,
      unit: it.unit,
    })),
  };
}

/** The connection fields the engine reads. Mirrors the `connections` row. */
export interface SyncConnection {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  status: 'active' | 'needs_reauth' | 'revoked';
}

/**
 * The database effects the engine needs, each already scoped to the one
 * connection being synced. The Convex action implements these over
 * `internalMutation`/`internalQuery` + `ctx.storage`; tests implement them
 * in-memory.
 */
export interface SyncDb {
  /** Persist a freshly refreshed token set and mark the connection active. */
  applyRefreshedTokens(tokens: TokenSet): Promise<void>;
  /** Flag the connection as needing re-authentication. */
  markNeedsReauth(): Promise<void>;
  /** True when a receipt with `externalId` already exists for the connection. */
  receiptExists(externalId: string): Promise<boolean>;
  /** Store the PDF bytes and return the opaque storage id. */
  storePdf(bytes: Uint8Array): Promise<string>;
  /** Insert the mapped receipt (header + items) transactionally. */
  insertReceipt(row: ReceiptRow, pdfStorageId: string): Promise<void>;
  /** Stamp the connection's `lastSyncedAt`. */
  touchLastSynced(): Promise<void>;
}

/** What a sync run yields. `status` reflects the connection's state after it. */
export interface SyncResult {
  synced: number;
  skipped: number;
  status: 'active' | 'needs_reauth';
}

export interface SyncDeps {
  fetch: FetchLike;
  connection: SyncConnection;
  db: SyncDb;
  /** Clock injection point for token-freshness checks (defaults to real time). */
  now?: number;
}

/**
 * Sync one linked connection: refresh the token if stale, list receipts, and
 * for each not already stored, fetch + store its PDF, parse it, and insert the
 * normalized receipt. Stamps `lastSyncedAt` on success.
 *
 * Throws only for an unusable connection (revoked). A failed token refresh is
 * not thrown — it returns `{ status: 'needs_reauth' }` so the caller can prompt
 * a re-link.
 */
export async function syncConnection(deps: SyncDeps): Promise<SyncResult> {
  const { fetch, connection, db, now = Date.now() } = deps;

  if (connection.status === 'revoked') {
    throw new Error('cannot sync a revoked connection');
  }

  let accessToken = connection.accessToken;
  const fresh = isAccessTokenValid(
    { expiresAt: connection.accessTokenExpiresAt } as TokenSet,
    now,
  );
  if (!fresh) {
    let refreshed: TokenSet;
    try {
      refreshed = await refreshBankId(fetch, connection.refreshToken);
    } catch {
      await db.markNeedsReauth();
      return { synced: 0, skipped: 0, status: 'needs_reauth' };
    }
    await db.applyRefreshedTokens(refreshed);
    accessToken = refreshed.accessToken;
  }

  const summaries = await listReceipts(fetch, accessToken);

  let synced = 0;
  let skipped = 0;
  for (const summary of summaries) {
    if (await db.receiptExists(summary.id)) {
      skipped++;
      continue;
    }
    const bytes = await fetchReceiptPdf(fetch, accessToken, summary.id);
    const pdfStorageId = await db.storePdf(bytes);
    const receipt = await parseCoopReceiptPdf(bytes, { includeRawText: true });
    await db.insertReceipt(mapReceiptToRow(receipt, summary.id), pdfStorageId);
    synced++;
  }

  await db.touchLastSynced();
  return { synced, skipped, status: 'active' };
}
