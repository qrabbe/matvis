import {
  isAccessTokenValid,
  type LineItem,
  type Receipt,
  type ReceiptCore,
  type TokenSet,
} from '@matvis/shared';
import type { Connector } from './connector';

export type ReceiptItemRow = Omit<LineItem, 'gtin'>;

export type ReceiptRow = Omit<ReceiptCore, 'source'> & {
  externalId: string;
  purchasedAtMs?: number;
  rawText?: string;
  items: ReceiptItemRow[];
};

export function mapReceiptToRow(
  receipt: Receipt,
  externalId: string,
): ReceiptRow {
  const { source, cashier, receiptType, items, ...core } = receipt;
  const ms = core.purchasedAt ? Date.parse(core.purchasedAt) : NaN;
  return {
    ...core,
    externalId,
    purchasedAtMs: Number.isNaN(ms) ? undefined : ms,
    items: items.map(({ gtin, ...line }) => line),
  };
}

export interface SyncConnection {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  status: 'active' | 'needs_reauth' | 'revoked';
}

export interface SyncDb {
  applyRefreshedTokens(tokens: TokenSet): Promise<void>;
  markNeedsReauth(): Promise<void>;
  receiptExists(externalId: string): Promise<boolean>;
  storePdf(bytes: Uint8Array): Promise<string>;
  insertReceipt(row: ReceiptRow, pdfStorageId: string): Promise<void>;
  touchLastSynced(): Promise<void>;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  status: 'active' | 'needs_reauth';
}

export interface SyncDeps {
  connector: Connector;
  connection: SyncConnection;
  db: SyncDb;
  now?: number;
}

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
