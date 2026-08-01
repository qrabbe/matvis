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
  // ── Login (Convex Auth) ───────────────────────────────────────────────
  // `users`, `authAccounts`, `authSessions`, …. A logged-in user's identity
  // becomes an `accounts.subject` below via the auth seam (model/auth.ts).
  ...authTables,

  // ── Identity ──────────────────────────────────────────────────────────
  // A connector principal — the opaque owner of connections + receipts,
  // resolved from the authenticated identity's stable id.
  accounts: defineTable({
    subject: v.string(), // opaque auth id; keeps us off a single provider
    // Account-wide API read token: the ONLY credential a third-party service
    // needs (with the deployment's public URL) to read this account's receipts.
    // Opaque secret, minted on first reveal. Optional so existing accounts stay
    // valid until they mint one. TODO: hash at rest before real traffic.
    token: v.optional(v.string()),
  })
    .index('by_subject', ['subject'])
    .index('by_token', ['token']),

  // ── Store links ───────────────────────────────────────────────────────
  // A linked store account (e.g. one Coop login) under one connector account.
  connections: defineTable({
    accountId: v.id('accounts'),
    store,
    // Secrets, encrypted at rest (AES-256-GCM, see src/crypto.ts). They are
    // decrypted only inside the sync action, right before the store API call.
    // The expiry timestamps stay plaintext so queries can judge validity.
    accessToken: encryptedSecretValidator,
    accessTokenExpiresAt: v.number(), // epoch ms
    refreshToken: encryptedSecretValidator,
    refreshTokenExpiresAt: v.optional(v.number()), // epoch ms; absent = no expiry
    status: connectionStatusValidator,
    lastSyncedAt: v.optional(v.number()), // epoch ms
  })
    .index('by_account', ['accountId'])
    .index('by_account_store', ['accountId', 'store'])
    // Stalest first within one status, which is the order the scheduled sync
    // wants. An absent `lastSyncedAt` sorts before any number, so a connection
    // that has never synced is picked up ahead of one that has.
    .index('by_status_last_synced', ['status', 'lastSyncedAt']),

  // In-flight BankID link attempts. Short-lived; deleted once resolved.
  // (The old repo's `bankid_sessions`.)
  pendingLinks: defineTable({
    accountId: v.id('accounts'),
    store,
    orderRef: v.string(),
    status: pendingLinkStatusValidator,
  })
    .index('by_account', ['accountId'])
    .index('by_order_ref', ['orderRef']),

  // ── Sync log ──────────────────────────────────────────────────────────
  // One row per sync ATTEMPT, which is the only trace a sync leaves behind. A
  // scheduled one has nobody watching it, and a manual one has only the red box
  // in the browser of whoever pressed the button. `status` opens at `running`
  // and is settled when the action returns or throws, so a row still reading
  // `running` is an attempt that died mid-flight.
  //
  // `by_connection` reads one store link's history without walking the table;
  // the newest runs across every connection are the default `_creationTime`
  // order descending, which needs no index.
  syncRuns: defineTable({
    connectionId: v.id('connections'),
    status: syncRunStatusValidator,
    startedAt: v.number(), // epoch ms
    finishedAt: v.optional(v.number()), // epoch ms; absent while running
    synced: v.optional(v.number()), // receipts newly stored
    skipped: v.optional(v.number()), // already-known receipts
    error: v.optional(v.string()), // set on `error`, truncated
  }).index('by_connection', ['connectionId']),

  // Singleton settings row, read with `.first()`. `paused` is checked at the
  // top of every sync, which is what lets a schedule be stopped without a
  // deploy: a schedule that cannot be stopped from outside is one that should
  // not be turned on.
  syncSettings: defineTable({
    paused: v.boolean(),
    updatedAt: v.number(),
  }),

  // ── Receipts ──────────────────────────────────────────────────────────
  // Normalized receipt header — one row per real-world purchase.
  receipts: defineTable({
    connectionId: v.id('connections'),
    accountId: v.id('accounts'),
    ...receiptContentFields,
    rawText: v.optional(v.string()),
  })
    // Deduplication: at most one receipt per (connection, externalId).
    .index('by_connection_external', ['connectionId', 'externalId'])
    .index('by_account', ['accountId']),

  receiptItems: defineTable({
    receiptId: v.id('receipts'),
    lineNo: v.number(), // preserve on-receipt order
    text: v.string(),
    price: v.number(),
    isDiscount: v.boolean(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    gtin: v.optional(v.string()), // the EAN; present once matched
  }).index('by_receipt', ['receiptId']),

  // ── Matching ──────────────────────────────────────────────────────────
  // Normalized line text → EAN, per store (the printed text is store-specific).
  // Starts empty, which makes the matcher a safe no-op; filling it is the future
  // matching engine's job, as an offline batch. Nothing at runtime reads the
  // catalog: the connector only ever produces EANs.
  itemGtinMap: defineTable({
    store,
    normalizedText: v.string(), // see normalizeItemText in @matvis/shared
    gtin: v.string(),
  }).index('by_store_text', ['store', 'normalizedText']),
});
