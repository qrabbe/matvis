'use node';
// Action-only. The Node runtime is required by PDF parsing, and the flip works
// only because every query and mutation this uses lives in `./model/receipts.ts`.
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

    const plaintextTokens = await decryptTokenPair(connection);

    const result = await syncConnection({
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

export const sync = action({
  args: { connectionId: v.id('connections') },
  returns: syncResultValidator,
  handler: async (ctx, { connectionId }) =>
    await runSync(ctx, connectionId, false),
});

export const syncScheduled = internalAction({
  args: { connectionId: v.id('connections') },
  returns: syncResultValidator,
  handler: async (ctx, { connectionId }) =>
    await runSync(ctx, connectionId, true),
});
