'use node';
// NOTE: keep this file ACTION-ONLY. This runs in the Node runtime (not the V8
// isolate) because `unpdf`/pdfjs calls `structuredClone(..., { transfer })`
// during PDF parsing, which the V8 isolate rejects ("structuredClone with
// transfer not supported"). Node supports it. This flip works only because
// every query/mutation it uses lives in `./model/receipts.ts`, not here.
import { v, type Infer } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { action, internalAction, type ActionCtx } from './_generated/server';
import { decryptTokenPair, encryptTokenPair } from '../src/crypto';
import { defaultFetch } from '../src/http';
import { getConnector } from '../src/registry';
import { syncConnection } from '../src/sync';
import { syncResultValidator } from './validators';

type SyncResult = Infer<typeof syncResultValidator>;

/**
 * Pull one linked store account's receipts INTO Convex: refresh the BankID
 * token if stale, list receipts from the store's API, then for each new one
 * fetch its PDF → parse → store. Returns how many were newly stored vs. skipped
 * as duplicates, plus the connection's resulting status (`needs_reauth` when a
 * token refresh failed).
 *
 * Every attempt is logged to `syncRuns`, settled with its counts or with the
 * error it threw, because otherwise a failed sync leaves no trace at all.
 *
 * `scheduled` chooses which connection read to use, and is the only difference
 * between the two entry points below: a cron has no identity, so the
 * owner-checked read would reject every connection it was handed.
 */
async function runSync(
  ctx: ActionCtx,
  connectionId: Id<'connections'>,
  scheduled: boolean,
): Promise<SyncResult> {
  const runId = await ctx.runMutation(internal.model.syncRuns.startRun, {
    connectionId,
  });
  try {
    const connection = scheduled
      ? await ctx.runQuery(
          internal.model.receipts.getConnectionForScheduledSync,
          { connectionId },
        )
      : await ctx.runQuery(internal.model.receipts.getConnectionForSync, {
          connectionId,
        });
    if (!connection) throw new Error('connection not found');

    // Paused: do no work and report the connection unchanged. A revoked
    // connection falls through to the engine instead, which still throws —
    // being unusable is a property of the link, not of the schedule.
    if (
      connection.status !== 'revoked' &&
      (await ctx.runQuery(internal.model.syncRuns.isPaused, {}))
    ) {
      await ctx.runMutation(internal.model.syncRuns.finishRun, {
        runId,
        status: 'paused',
      });
      return { synced: 0, skipped: 0, status: connection.status };
    }

    // The stored tokens are ciphertext. Decrypt them here, in the action, so
    // the plaintext exists only in memory for the length of this sync.
    const plaintextTokens = await decryptTokenPair(connection);

    const result = await syncConnection({
      // Which store this is comes off the connection row, so the engine below
      // stays store-agnostic.
      connector: getConnector(connection.store, { fetch: defaultFetch }),
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
          // `row` (a `ReceiptRow`) is exactly the mutation's content shape;
          // the connection-derived fields + storage id are the only additions.
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

    // A refresh that failed returns normally with nothing synced, so it gets
    // its own run status rather than hiding behind `ok`.
    await ctx.runMutation(internal.model.syncRuns.finishRun, {
      runId,
      status: result.status === 'needs_reauth' ? 'needs_reauth' : 'ok',
      synced: result.synced,
      skipped: result.skipped,
    });
    return result;
  } catch (error) {
    await ctx.runMutation(internal.model.syncRuns.finishRun, {
      runId,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Sync one of the caller's own connections. The link flow calls this, and so
 * does the resync control. Ownership is checked on the connection read. */
export const sync = action({
  args: { connectionId: v.id('connections') },
  returns: syncResultValidator,
  handler: async (ctx, { connectionId }) =>
    await runSync(ctx, connectionId, false),
});

/**
 * One connection's nightly sync, scheduled by `crons.dispatchSync`. Internal
 * because it skips the ownership check the public action performs: it is handed
 * a connection id by a dispatcher that read it out of the table itself, and a
 * client can reach neither.
 */
export const syncScheduled = internalAction({
  args: { connectionId: v.id('connections') },
  returns: syncResultValidator,
  handler: async (ctx, { connectionId }) =>
    await runSync(ctx, connectionId, true),
});
