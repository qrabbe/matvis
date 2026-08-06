import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import {
  connectionStatusValidator,
  encryptedSecretValidator,
  pendingLinkStatusValidator,
  receiptContentFields,
  storeValidator as store,
  syncRunStatusValidator,
} from './validators';

export default defineSchema({
  ...authTables,

  accounts: defineTable({
    subject: v.string(),
    token: v.optional(v.string()),
  })
    .index('by_subject', ['subject'])
    .index('by_token', ['token']),

  connections: defineTable({
    accountId: v.id('accounts'),
    store,
    // Ciphertext. Decrypted only inside the sync action, never at rest.
    accessToken: encryptedSecretValidator,
    accessTokenExpiresAt: v.number(), // epoch ms
    refreshToken: encryptedSecretValidator,
    refreshTokenExpiresAt: v.optional(v.number()), // epoch ms, absent = no expiry
    status: connectionStatusValidator,
    lastSyncedAt: v.optional(v.number()), // epoch ms
  })
    .index('by_account', ['accountId'])
    .index('by_account_store', ['accountId', 'store'])
    .index('by_status_last_synced', ['status', 'lastSyncedAt']),

  pendingLinks: defineTable({
    accountId: v.id('accounts'),
    store,
    orderRef: v.string(),
    status: pendingLinkStatusValidator,
  })
    .index('by_account', ['accountId'])
    .index('by_order_ref', ['orderRef']),

  syncRuns: defineTable({
    connectionId: v.id('connections'),
    status: syncRunStatusValidator,
    startedAt: v.number(), // epoch ms
    finishedAt: v.optional(v.number()), // epoch ms, absent while running
    synced: v.optional(v.number()),
    skipped: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index('by_connection', ['connectionId']),

  syncSettings: defineTable({
    paused: v.boolean(),
    updatedAt: v.number(),
  }),

  receipts: defineTable({
    connectionId: v.id('connections'),
    accountId: v.id('accounts'),
    ...receiptContentFields,
    rawText: v.optional(v.string()),
  })
    .index('by_connection_external', ['connectionId', 'externalId'])
    .index('by_account', ['accountId']),

  receiptItems: defineTable({
    receiptId: v.id('receipts'),
    lineNo: v.number(),
    text: v.string(),
    price: v.number(),
    isDiscount: v.boolean(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    gtin: v.optional(v.string()),
  }).index('by_receipt', ['receiptId']),

  itemGtinMap: defineTable({
    store,
    normalizedText: v.string(), // see normalizeItemText in @matvis/shared
    gtin: v.string(),
  }).index('by_store_text', ['store', 'normalizedText']),
});
