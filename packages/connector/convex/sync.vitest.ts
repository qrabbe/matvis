/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import {
  decryptTokenPair,
  encryptTokenPair,
  generateTokenKey,
} from '../src/crypto';
import type { FetchLike } from '../src/http';
import { bytesResponse, jsonResponse } from '../test/helpers';

const modules = import.meta.glob('./**/*.ts');

process.env.TOKEN_ENC_KEY = generateTokenKey();

const transport = vi.hoisted(() => ({
  fetch: undefined as FetchLike | undefined,
}));

vi.mock('../src/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/http')>()),
  defaultFetch: ((url, init) => transport.fetch!(url, init)) as FetchLike,
}));

function makeReceiptPdf(lines: string[]): Uint8Array {
  const content = `BT /F1 10 Tf 14 TL 40 800 Td ${lines
    .map((line) => `(${line.replace(/([()\\])/g, '\\$1')}) Tj T*`)
    .join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const offsets: number[] = [];
  let pdf = '%PDF-1.4\n';
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${startxref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const receiptPdf = makeReceiptPdf([
  'Stora Coop Testby',
  '12345 Staden',
  'Kvitto 100000-001-00001',
  'Datum 2026-01-09 12:34',
  'Org.Nr 5560001234',
  'MJOLK 12,50',
  'RABATT -5,00',
  'Total SEK 7,50',
  'Antal artiklar 2',
  '12% 0,80 6,70 7,50',
]);

function routes(opts: { list?: string[]; refresh?: 'ok' | 'fail' }): FetchLike {
  const list = opts.list ?? [];
  return async (url) => {
    if (url.includes('/formalReceipt')) return bytesResponse(receiptPdf);
    if (url.includes('/openid-connect/token')) {
      return opts.refresh === 'fail'
        ? jsonResponse({ error: 'invalid_grant' }, { ok: false, status: 400 })
        : jsonResponse({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            refresh_expires_in: 86400,
          });
    }
    if (url.includes('/kvitto/rest/receipts/v1')) {
      return jsonResponse({
        data: list.map((id) => ({ receipt_id: id })),
        current_page: 1,
        total: list.length,
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };
}

const as = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

async function seed(
  t: ReturnType<typeof convexTest>,
  options: {
    expired?: boolean;
    status?: 'active' | 'needs_reauth' | 'revoked';
  } = {},
) {
  const sealed = await encryptTokenPair({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  });
  return await t.run(async (ctx) => {
    const link = async (subject: string) => {
      const accountId = await ctx.db.insert('accounts', { subject });
      const connectionId = await ctx.db.insert('connections', {
        accountId,
        store: 'coop' as const,
        accessToken: sealed.accessToken,
        accessTokenExpiresAt:
          Date.now() + (options.expired ? -1000 : 3_600_000),
        refreshToken: sealed.refreshToken,
        status: options.status ?? ('active' as const),
      });
      return { accountId, connectionId };
    };
    return { a: await link('sub-a'), b: await link('sub-b') };
  });
}

const connectionRow = (
  t: ReturnType<typeof convexTest>,
  connectionId: Id<'connections'>,
) => t.run(async (ctx) => await ctx.db.get(connectionId));

async function storedReceipts(
  t: ReturnType<typeof convexTest>,
  connectionId: Id<'connections'>,
) {
  return await t.run(async (ctx) => {
    const receipts = await ctx.db
      .query('receipts')
      .withIndex('by_connection_external', (q) =>
        q.eq('connectionId', connectionId),
      )
      .collect();
    return await Promise.all(
      receipts.map(async (receipt) => ({
        receipt,
        items: await ctx.db
          .query('receiptItems')
          .withIndex('by_receipt', (q) => q.eq('receiptId', receipt._id))
          .collect(),
      })),
    );
  });
}

const runsFor = (
  t: ReturnType<typeof convexTest>,
  connectionId: Id<'connections'>,
) =>
  t.run(async (ctx) =>
    ctx.db
      .query('syncRuns')
      .withIndex('by_connection', (q) => q.eq('connectionId', connectionId))
      .collect(),
  );

describe('connection reads for sync', () => {
  test('getConnectionForSync returns the owner their connection, tokens still sealed', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const connection = await as(t, 'sub-a').query(
      internal.model.receipts.getConnectionForSync,
      { connectionId: a.connectionId },
    );
    expect(Object.keys(connection!).sort()).toEqual([
      'accessToken',
      'accessTokenExpiresAt',
      'accountId',
      'refreshToken',
      'status',
      'store',
    ]);
    expect(connection?.accountId).toBe(a.accountId);
    expect(connection?.store).toBe('coop');
    expect(connection?.status).toBe('active');
    expect(typeof connection?.accessToken.ciphertext).toBe('string');
  });

  test('getConnectionForSync is null for another account and for a missing row', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const foreign = await as(t, 'sub-b').query(
      internal.model.receipts.getConnectionForSync,
      { connectionId: a.connectionId },
    );
    expect(foreign).toBeNull();

    await t.run(async (ctx) => await ctx.db.delete(a.connectionId));
    const gone = await as(t, 'sub-a').query(
      internal.model.receipts.getConnectionForSync,
      { connectionId: a.connectionId },
    );
    expect(gone).toBeNull();
  });

  test('the scheduled read skips the ownership check, since a cron has no identity', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const connection = await t.query(
      internal.model.receipts.getConnectionForScheduledSync,
      { connectionId: a.connectionId },
    );
    expect(connection?.accountId).toBe(a.accountId);
  });
});

describe('receiptExists', () => {
  test('keys on the connection as well as the external id', async () => {
    const t = convexTest(schema, modules);
    const { a, b } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('receipts', {
        connectionId: a.connectionId,
        accountId: a.accountId,
        source: 'coop',
        externalId: 'r1',
        store: { name: 'Stora Coop' },
        currency: 'SEK',
        vat: [],
      });
    });
    const exists = (connectionId: Id<'connections'>, externalId: string) =>
      t.query(internal.model.receipts.receiptExists, {
        connectionId,
        externalId,
      });
    expect(await exists(a.connectionId, 'r1')).toBe(true);
    expect(await exists(a.connectionId, 'r2')).toBe(false);
    expect(await exists(b.connectionId, 'r1')).toBe(false);
  });
});

describe('insertReceipt', () => {
  test('writes the header and numbers the items in the order given', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const receiptId = await t.mutation(internal.model.receipts.insertReceipt, {
      connectionId: a.connectionId,
      accountId: a.accountId,
      source: 'coop',
      externalId: 'r1',
      store: { name: 'Stora Coop' },
      currency: 'SEK',
      total: 7.5,
      vat: [{ rate: 12, vat: 0.8, net: 6.7, gross: 7.5 }],
      rawText: 'raw',
      items: [
        { text: 'MJOLK', price: 12.5, isDiscount: false, quantity: 1 },
        { text: 'RABATT', price: -5, isDiscount: true },
        { text: 'BANAN', price: 6, isDiscount: false, unit: 'KG' },
      ],
    });

    const [stored] = await storedReceipts(t, a.connectionId);
    expect(stored.receipt._id).toBe(receiptId);
    expect(stored.receipt.externalId).toBe('r1');
    expect(stored.receipt.rawText).toBe('raw');
    expect(stored.receipt.total).toBe(7.5);
    const items = stored.items.sort((x, y) => x.lineNo - y.lineNo);
    expect(items.map((item) => [item.lineNo, item.text])).toEqual([
      [0, 'MJOLK'],
      [1, 'RABATT'],
      [2, 'BANAN'],
    ]);
    expect(items[0].quantity).toBe(1);
    expect(items[2].unit).toBe('KG');
    expect(items.every((item) => item.gtin === undefined)).toBe(true);
  });
});

describe('connection writes', () => {
  test('applyRefreshedTokens replaces both tokens and reactivates the link', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t, { status: 'needs_reauth' });
    const sealed = await encryptTokenPair({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    });
    await t.mutation(internal.model.receipts.applyRefreshedTokens, {
      connectionId: a.connectionId,
      accessToken: sealed.accessToken,
      accessTokenExpiresAt: 1_800_000,
      refreshToken: sealed.refreshToken,
      refreshTokenExpiresAt: 3_600_000,
    });

    const row = await connectionRow(t, a.connectionId);
    expect(row?.status).toBe('active');
    expect(row?.accessTokenExpiresAt).toBe(1_800_000);
    expect(row?.refreshTokenExpiresAt).toBe(3_600_000);
    expect(await decryptTokenPair(row!)).toEqual({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    });
  });

  test('markNeedsReauth flags the link, touchLastSynced stamps it', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    expect(
      (await connectionRow(t, a.connectionId))?.lastSyncedAt,
    ).toBeUndefined();

    const before = Date.now();
    await t.mutation(internal.model.receipts.markNeedsReauth, {
      connectionId: a.connectionId,
    });
    await t.mutation(internal.model.receipts.touchLastSynced, {
      connectionId: a.connectionId,
    });

    const row = await connectionRow(t, a.connectionId);
    expect(row?.status).toBe('needs_reauth');
    expect(row?.lastSyncedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('sync action', () => {
  test('stores what the store lists, then skips it on the next run', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    transport.fetch = routes({ list: ['r1', 'r2'] });

    const first = await as(t, 'sub-a').action(api.sync.sync, {
      connectionId: a.connectionId,
    });
    expect(first).toEqual({ synced: 2, skipped: 0, status: 'active' });

    const stored = await storedReceipts(t, a.connectionId);
    expect(stored.map((row) => row.receipt.externalId).sort()).toEqual([
      'r1',
      'r2',
    ]);
    expect(stored[0].receipt.pdfStorageId).toBeDefined();
    expect(stored[0].receipt.rawText).toContain('MJOLK');
    expect(stored[0].receipt.store.name).toBe('Stora Coop Testby');
    expect(stored[0].items.map((item) => item.text)).toEqual([
      'MJOLK 12,50',
      'RABATT -5,00',
    ]);
    expect(
      (await connectionRow(t, a.connectionId))?.lastSyncedAt,
    ).toBeDefined();

    const second = await as(t, 'sub-a').action(api.sync.sync, {
      connectionId: a.connectionId,
    });
    expect(second).toEqual({ synced: 0, skipped: 2, status: 'active' });
    expect(await storedReceipts(t, a.connectionId)).toHaveLength(2);
    expect((await runsFor(t, a.connectionId)).map((run) => run.status)).toEqual(
      ['ok', 'ok'],
    );
  });

  test('refuses another account the connection, and logs the failed run', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    transport.fetch = () => {
      throw new Error('the gate should have closed before any store call');
    };

    await expect(
      as(t, 'sub-b').action(api.sync.sync, { connectionId: a.connectionId }),
    ).rejects.toThrow(/connection not found/);

    expect(await storedReceipts(t, a.connectionId)).toEqual([]);
    const [run] = await runsFor(t, a.connectionId);
    expect(run.status).toBe('error');
    expect(run.error).toMatch(/connection not found/);
  });

  test('refreshes a stale access token and stores the new pair encrypted', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t, { expired: true });
    transport.fetch = routes({ list: [], refresh: 'ok' });

    const result = await as(t, 'sub-a').action(api.sync.sync, {
      connectionId: a.connectionId,
    });
    expect(result).toEqual({ synced: 0, skipped: 0, status: 'active' });

    const row = await connectionRow(t, a.connectionId);
    expect(row?.status).toBe('active');
    expect(row?.refreshTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(row?.accessToken.ciphertext).not.toBe('new-access');
    expect(await decryptTokenPair(row!)).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  test('marks the connection needs_reauth when the refresh is rejected', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t, { expired: true });
    transport.fetch = routes({ list: ['r1'], refresh: 'fail' });

    const result = await as(t, 'sub-a').action(api.sync.sync, {
      connectionId: a.connectionId,
    });
    expect(result).toEqual({ synced: 0, skipped: 0, status: 'needs_reauth' });
    expect((await connectionRow(t, a.connectionId))?.status).toBe(
      'needs_reauth',
    );
    expect(await storedReceipts(t, a.connectionId)).toEqual([]);
    const [run] = await runsFor(t, a.connectionId);
    expect(run.status).toBe('needs_reauth');
  });

  test('does no work at all while syncing is paused', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    await t.mutation(internal.model.syncRuns.setPaused, { paused: true });
    transport.fetch = () => {
      throw new Error('a paused sync must not call the store');
    };

    const result = await as(t, 'sub-a').action(api.sync.sync, {
      connectionId: a.connectionId,
    });
    expect(result).toEqual({ synced: 0, skipped: 0, status: 'active' });
    expect(await storedReceipts(t, a.connectionId)).toEqual([]);
    const [run] = await runsFor(t, a.connectionId);
    expect(run.status).toBe('paused');
    expect(
      (await connectionRow(t, a.connectionId))?.lastSyncedAt,
    ).toBeUndefined();
  });
});
