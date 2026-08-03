import {
  isAccessTokenValid,
  type LineItem,
  type Receipt,
  type ReceiptCore,
  type TokenSet,
} from '@matvis/shared';
import type { Connector } from './connector';

// The runtime-agnostic, store-agnostic sync engine. It orchestrates list →
// fetch PDF → parse → dedup → store for one linked connection, talking to
// injected ports only (a `Connector` for the store's API and a small DB port).
// That keeps it unit-testable with stub deps and lets the Convex action in
// `convex/sync.ts` stay a thin adapter — so flipping that action to
// `"use node";` never touches this logic. Which store is being synced is the
// caller's concern: it resolves the connector from `connection.store` through
// the registry and passes it in.

/** One receipt line, mapped to the connector's `receiptItems` shape: the shared
 * {@link LineItem} without `gtin`, which a later matching pass fills. */
export type ReceiptItemRow = Omit<LineItem, 'gtin'>;

/**
 * A parsed receipt, mapped to the connector's `receipts` header + items. Derived
 * from the contract's {@link ReceiptCore} rather than restated, so the two
 * cannot drift. `source` is dropped because the connection knows which store it
 * is and the PDF's own claim is not authoritative. `rawText` is carried because
 * the row keeps it even though header reads do not return it.
 */
export type ReceiptRow = Omit<ReceiptCore, 'source'> & {
  /** The store's id for this receipt. The deduplication key. */
  externalId: string;
  /** `purchasedAt` as epoch ms, `undefined` when it did not parse. */
  purchasedAtMs?: number;
  rawText?: string;
  items: ReceiptItemRow[];
};

/**
 * Map a parsed {@link Receipt} to the connector's storage row. Pure: no I/O.
 * The rest spread carries the core across, so a field added to the contract
 * lands here without an edit. `purchasedAtMs` is derived from the ISO
 * `purchasedAt`, guarding an unparseable date to `undefined`.
 */
export function mapReceiptToRow(
  receipt: Receipt,
  externalId: string,
): ReceiptRow {
  // `cashier` and `receiptType` are printed detail with no column.
  const { source, cashier, receiptType, items, ...core } = receipt;
  const ms = core.purchasedAt ? Date.parse(core.purchasedAt) : NaN;
  return {
    ...core,
    externalId,
    purchasedAtMs: Number.isNaN(ms) ? undefined : ms,
    items: items.map(({ gtin, ...line }) => line),
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
  /** The store's connector, already resolved from `connection.store`. */
  connector: Connector;
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
  const { connector, connection, db, now = Date.now() } = deps;

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
      refreshed = await connector.refresh(connection.refreshToken);
    } catch {
      await db.markNeedsReauth();
      return { synced: 0, skipped: 0, status: 'needs_reauth' };
    }
    await db.applyRefreshedTokens(refreshed);
    accessToken = refreshed.accessToken;
  }

  const summaries = await connector.listReceipts(accessToken);

  let synced = 0;
  let skipped = 0;
  for (const summary of summaries) {
    if (await db.receiptExists(summary.id)) {
      skipped++;
      continue;
    }
    const bytes = await connector.fetchReceiptPdf(accessToken, summary.id);
    // Storing and parsing both read `bytes` but not each other; overlap them.
    const [pdfStorageId, receipt] = await Promise.all([
      db.storePdf(bytes),
      connector.parseReceipt(bytes, { includeRawText: true }),
    ]);
    await db.insertReceipt(mapReceiptToRow(receipt, summary.id), pdfStorageId);
    synced++;
  }

  await db.touchLastSynced();
  return { synced, skipped, status: 'active' };
}
