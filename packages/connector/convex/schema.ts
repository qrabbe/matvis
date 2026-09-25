import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import {
  connectionStatusValidator,
  encryptedSecretValidator,
  itemGtinMapKindValidator,
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
    /** `product` resolves to a real catalog item (`gtin` required).
     * `produce` and `notFood` classify a text without a catalog row — loose
     * produce and non-food/fees respectively. `notInCatalog` is real food
     * the catalog doesn't carry. Only `product` ever carries a `gtin`. */
    kind: itemGtinMapKindValidator,
    gtin: v.optional(v.string()),
    /** A reference unit price for this gtin, when known (e.g. the shelf
     * price at link time). The same printed text can mean different real
     * products at different sizes — Coop prints "HAVREGRYN" for both a
     * 750g and a 1500g bag at different prices — so a text can legitimately
     * have more than one row. `resolveMapping` uses this to pick the row
     * whose price best fits a specific line instead of grabbing whichever
     * row comes first. Absent means "the generic mapping for this text",
     * used as a catch-all when no priced row fits (see matching.ts). */
    price: v.optional(v.number()),
    /** `seed` for a one-time import, `app` for a write from the identify
     * flow. Both are equally authoritative at read time; this is
     * provenance, not a trust ranking. */
    source: v.union(v.literal('seed'), v.literal('app')),
    /** The account that made this mapping, when it came from the app.
     * Informational only — every mapping is chain-wide and applies to
     * every account, never scoped by who wrote it. */
    createdBy: v.optional(v.id('accounts')),
  }).index('by_store_text', ['store', 'normalizedText']),
});
