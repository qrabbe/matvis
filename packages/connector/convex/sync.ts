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
import { decryptTokenPair, encryptTokenPair } from '../src/crypto';
import { defaultFetch } from '../src/http';
import { syncConnection } from '../src/sync';
import { syncStatusValidator } from './validators';

/**
 * Pull one linked store account's receipts INTO Convex: refresh the BankID
 * token if stale, list receipts from the store's API, then for each new one
 * fetch its PDF → parse → store. Returns how many were newly stored vs. skipped
 * as duplicates, plus the connection's resulting status (`needs_reauth` when a
 * token refresh failed).
 */
export const sync = action({
  args: { connectionId: v.id('connections') },
  returns: v.object({
    synced: v.number(),
    skipped: v.number(),
    status: syncStatusValidator,
  }),
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.runQuery(
      internal.model.receipts.getConnectionForSync,
      { connectionId },
    );
    if (!connection) throw new Error('connection not found');

    // The stored tokens are ciphertext. Decrypt them here, in the action, so the
    // plaintext exists only in memory for the length of this sync.
    const plaintextTokens = await decryptTokenPair(connection);

    return await syncConnection({
      fetch: defaultFetch,
      connection: { ...connection, ...plaintextTokens },
      db: {
        applyRefreshedTokens: async (tokens) => {
          const sealed = await encryptTokenPair(tokens);
          await ctx.runMutation(internal.model.receipts.applyRefreshedTokens, {
            connectionId,
            accessToken: sealed.accessToken,
            accessTokenExpiresAt: tokens.expiresAt,
            refreshToken: sealed.refreshToken,
            refreshTokenExpiresAt: tokens.refreshExpiresAt,
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
          // `row` (a `ReceiptRow`) is exactly the mutation's content shape; the
          // connection-derived fields + storage id are the only additions.
          await ctx.runMutation(internal.model.receipts.insertReceipt, {
            ...row,
            connectionId,
            accountId: connection.accountId,
            source: connection.store,
            pdfStorageId: pdfStorageId as Id<'_storage'>,
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
