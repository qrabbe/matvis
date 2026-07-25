import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Receipt } from '@matvis/shared';
import { describe, expect, it } from 'bun:test';
import type { FetchLike } from '../src/http';
import {
  mapReceiptToRow,
  type ReceiptRow,
  type SyncConnection,
  type SyncDb,
  syncConnection,
} from '../src/sync';
import { bytesResponse, jsonResponse } from './helpers';

// ── mapReceiptToRow (pure) ──────────────────────────────────────────────────

const baseReceipt: Receipt = {
  schemaVersion: 1,
  source: 'coop',
  store: { name: 'Stora Coop Test', city: 'Test' },
  receiptNumber: '100000-001-00001',
  purchasedAt: '2026-01-09T12:34:00.000Z',
  cashier: '42',
  receiptType: 'Elektroniskt kassakvitto',
  currency: 'SEK',
  total: 123.5,
  itemCount: 2,
  discountsTotal: -5,
  pointsAmount: 100,
  vat: [{ rate: 12, vat: 1, net: 9, gross: 10 }],
  items: [
    { text: 'MJÖLK', price: 12.5, isDiscount: false, quantity: 1, unit: 'ST' },
    { text: 'RABATT', price: -5, isDiscount: true },
  ],
  loyaltyCardId: 'card-1',
  rawText: 'raw',
};

describe('mapReceiptToRow', () => {
  it('derives purchasedAtMs from the ISO date', () => {
    const row = mapReceiptToRow(baseReceipt, 'ext-1');
    expect(row.externalId).toBe('ext-1');
    expect(row.purchasedAtMs).toBe(Date.parse('2026-01-09T12:34:00.000Z'));
  });

  it('guards an unparseable date to undefined', () => {
    const row = mapReceiptToRow(
      { ...baseReceipt, purchasedAt: 'not-a-date' },
      'x',
    );
    expect(row.purchasedAtMs).toBeUndefined();
    expect(row.purchasedAt).toBe('not-a-date');
  });

  it('leaves purchasedAtMs undefined when there is no date', () => {
    const row = mapReceiptToRow(
      { ...baseReceipt, purchasedAt: undefined },
      'x',
    );
    expect(row.purchasedAtMs).toBeUndefined();
  });

  it('drops cashier/receiptType (no schema column)', () => {
    const row = mapReceiptToRow(baseReceipt, 'x') as Record<string, unknown>;
    expect('cashier' in row).toBe(false);
    expect('receiptType' in row).toBe(false);
  });

  it('maps items without a gtin, preserving isDiscount/quantity/unit', () => {
    const row = mapReceiptToRow(baseReceipt, 'x');
    expect(row.items).toHaveLength(2);
    expect('gtin' in row.items[0]).toBe(false);
    expect(row.items[0]).toEqual({
      text: 'MJÖLK',
      price: 12.5,
      isDiscount: false,
      quantity: 1,
      unit: 'ST',
    });
    expect(row.items[1].isDiscount).toBe(true);
  });
});

// ── syncConnection (orchestration) ──────────────────────────────────────────

/** A stub `SyncDb` backed by an in-memory receipt set, recording effects. */
function makeDb() {
  const stored = new Set<string>();
  const inserted: Array<{ row: ReceiptRow; pdfStorageId: string }> = [];
  const events: string[] = [];
  const db: SyncDb = {
    applyRefreshedTokens: async () => {
      events.push('refresh');
    },
    markNeedsReauth: async () => {
      events.push('needs_reauth');
    },
    receiptExists: async (externalId) => stored.has(externalId),
    storePdf: async () => `storage_${inserted.length}`,
    insertReceipt: async (row, pdfStorageId) => {
      stored.add(row.externalId);
      inserted.push({ row, pdfStorageId });
    },
    touchLastSynced: async () => {
      events.push('touched');
    },
  };
  return { db, stored, inserted, events };
}

/** Route the connector's calls to canned responses off a single PDF fixture. */
function makeFetch(opts: {
  pdf: Uint8Array;
  list: Array<Record<string, unknown>>;
  refresh?: 'ok' | 'fail';
}): FetchLike {
  return async (url) => {
    if (url.includes('/formalReceipt')) return bytesResponse(opts.pdf);
    if (url.includes('/openid-connect/token')) {
      if (opts.refresh === 'fail') {
        return jsonResponse(
          { error: 'invalid_grant' },
          { ok: false, status: 400 },
        );
      }
      return jsonResponse({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
    }
    if (url.includes('/kvitto/rest/receipts/v1')) {
      return jsonResponse({
        data: opts.list,
        current_page: 1,
        total: opts.list.length,
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };
}

const activeConnection: SyncConnection = {
  accessToken: 'access-token',
  accessTokenExpiresAt: Date.now() + 3_600_000, // fresh → no refresh
  refreshToken: 'refresh-token',
  status: 'active',
};

// Real receipt PDFs live in ./documents (git-ignored). The dedup/refresh flow
// runs the actual parser, so it needs a real PDF; skip cleanly when none.
const documentsDir = fileURLToPath(new URL('./documents/', import.meta.url));
const pdfNames = readdirSync(documentsDir)
  .filter((n) => n.toLowerCase().endsWith('.pdf'))
  .sort();

describe('syncConnection', () => {
  it('throws on a revoked connection', async () => {
    const { db } = makeDb();
    await expect(
      syncConnection({
        fetch: makeFetch({ pdf: new Uint8Array(), list: [] }),
        connection: { ...activeConnection, status: 'revoked' },
        db,
      }),
    ).rejects.toThrow(/revoked/);
  });

  it('marks needs_reauth (not thrown) when a stale token fails to refresh', async () => {
    const { db, events } = makeDb();
    const result = await syncConnection({
      fetch: makeFetch({ pdf: new Uint8Array(), list: [], refresh: 'fail' }),
      connection: {
        ...activeConnection,
        accessTokenExpiresAt: Date.now() - 1000,
      },
      db,
    });
    expect(result).toEqual({ synced: 0, skipped: 0, status: 'needs_reauth' });
    expect(events).toContain('needs_reauth');
    expect(events).not.toContain('touched');
  });

  if (pdfNames.length === 0) {
    it.skip('dedup/refresh flow (no local PDFs in test/documents)', () => {});
    return;
  }

  it('stores new receipts, then skips them on a second run (dedup)', async () => {
    const pdf = new Uint8Array(await readFile(documentsDir + pdfNames[0]));
    const list = [{ receipt_id: 'r1' }, { receipt_id: 'r2' }];
    const { db, stored, inserted, events } = makeDb();
    const fetch = makeFetch({ pdf, list });

    const first = await syncConnection({
      fetch,
      connection: activeConnection,
      db,
    });
    expect(first).toEqual({ synced: 2, skipped: 0, status: 'active' });
    expect(stored.size).toBe(2);
    expect(inserted[0].pdfStorageId).toMatch(/^storage_/);
    expect(inserted[0].row.rawText).toBeTruthy(); // parsed with includeRawText
    expect(events).toContain('touched');

    const second = await syncConnection({
      fetch,
      connection: activeConnection,
      db,
    });
    expect(second).toEqual({ synced: 0, skipped: 2, status: 'active' });
    expect(stored.size).toBe(2); // nothing new inserted
  });

  it('refreshes a stale token, then syncs', async () => {
    const pdf = new Uint8Array(await readFile(documentsDir + pdfNames[0]));
    const { db, events } = makeDb();
    const result = await syncConnection({
      fetch: makeFetch({ pdf, list: [{ receipt_id: 'r1' }], refresh: 'ok' }),
      connection: {
        ...activeConnection,
        accessTokenExpiresAt: Date.now() - 1000,
      },
      db,
    });
    expect(result).toEqual({ synced: 1, skipped: 0, status: 'active' });
    expect(events).toContain('refresh');
  });
});
