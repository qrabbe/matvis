import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import {
  connectionStatusValidator,
  pendingLinkStatusValidator,
  receiptContentFields,
  storeValidator as store,
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
  }).index('by_subject', ['subject']),

  // ── Store links ───────────────────────────────────────────────────────
  // A linked store account (e.g. one Coop login) under one connector account.
  connections: defineTable({
    accountId: v.id('accounts'),
    store,
    // Secrets. TODO: encrypt at rest before real tokens land here.
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(), // epoch ms
    refreshToken: v.string(),
    refreshTokenExpiresAt: v.optional(v.number()), // epoch ms; absent = no expiry
    status: connectionStatusValidator,
    lastSyncedAt: v.optional(v.number()), // epoch ms
  })
    .index('by_account', ['accountId'])
    .index('by_account_store', ['accountId', 'store']),

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
});
