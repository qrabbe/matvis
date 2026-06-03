'use node';
// NOTE: keep this file ACTION-ONLY. This runs in the Node runtime (not the V8
// isolate) because `unpdf`/pdfjs calls `structuredClone(..., { transfer })`
// during PDF parsing, which the V8 isolate rejects ("structuredClone with
// transfer not supported"). Node supports it. This flip works only because
// every query/mutation it uses lives in `./model/receipts.ts`, not here.
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { defaultFetch } from '../src/http';
import { syncConnection } from '../src/sync';

/**
 * Sync one linked connection: pull its receipts (list → fetch PDF → parse →
 * dedup → store), refreshing the BankID token first if stale. Returns how many
 * receipts were newly stored vs. skipped as duplicates, plus the connection's
 * resulting status (`needs_reauth` when a token refresh failed).
 */
export const sync = action({
  args: {
    connectionId: v.id('connections'),
    subject: v.optional(v.string()),
  },
  returns: v.object({
    synced: v.number(),
    skipped: v.number(),
    status: v.union(v.literal('active'), v.literal('needs_reauth')),
  }),
  handler: async (ctx, { connectionId, subject }) => {
    const connection = await ctx.runQuery(
      internal.model.receipts.getConnectionForSync,
      { connectionId, subject },
    );
    if (!connection) throw new Error('connection not found');

    return await syncConnection({
      fetch: defaultFetch,
      connection,
      db: {
        applyRefreshedTokens: async (tokens) => {
          await ctx.runMutation(internal.model.receipts.applyRefreshedTokens, {
            connectionId,
            accessToken: tokens.accessToken,
            accessTokenExpiresAt: tokens.expiresAt,
            refreshToken: tokens.refreshToken,
          });
        },
        markNeedsReauth: async () => {
          await ctx.runMutation(internal.model.receipts.markNeedsReauth, {
            connectionId,
          });
        },
        receiptExists: (externalId) =>
          ctx.runQuery(internal.model.receipts.receiptExists, {
            connectionId,
            externalId,
          }),
        storePdf: (bytes) =>
          ctx.storage.store(
            new Blob([bytes as unknown as BlobPart], {
              type: 'application/pdf',
            }),
          ),
        insertReceipt: async (row, pdfStorageId) => {
          await ctx.runMutation(internal.model.receipts.insertReceipt, {
            connectionId,
            accountId: connection.accountId,
            source: connection.store,
            externalId: row.externalId,
            schemaVersion: row.schemaVersion,
            store: row.store,
            receiptNumber: row.receiptNumber,
            purchasedAt: row.purchasedAt,
            purchasedAtMs: row.purchasedAtMs,
            currency: row.currency,
            total: row.total,
            itemCount: row.itemCount,
            discountsTotal: row.discountsTotal,
            pointsAmount: row.pointsAmount,
            vat: row.vat,
            loyaltyCardId: row.loyaltyCardId,
            pdfStorageId: pdfStorageId as Id<'_storage'>,
            rawText: row.rawText,
            items: row.items,
          });
        },
        touchLastSynced: async () => {
          await ctx.runMutation(internal.model.receipts.touchLastSynced, {
            connectionId,
          });
        },
      },
    });
  },
});
