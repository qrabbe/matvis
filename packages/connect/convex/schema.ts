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
  // `users`, `authAccounts`, `authSessions`, … — the connector is its own
  // identity authority (plan §5). A logged-in user's identity becomes the
  // `accounts.subject` below via the auth seam (model/auth.ts). Distinct from
  // the connector's `accounts` table — Convex Auth uses `authAccounts`.
  ...authTables,

  // ── Identity ──────────────────────────────────────────────────────────
  // A connector principal: the opaque owner of connections + receipts. This is
  // the connector service's OWN account, separate from any consuming app's
  // user. An app links to one of these via a grant token (service auth, later).
  accounts: defineTable({
    // Opaque auth subject — whatever authenticates to the connector. Keeps the
    // connector from being welded to a single auth provider.
    subject: v.string(),
  }).index('by_subject', ['subject']),

  // ── Store links ───────────────────────────────────────────────────────
  // A linked store account (e.g. one Coop login) under one connector account.
  // Folds the old repo's `external_api_tokens` onto the connection row.
  connections: defineTable({
    accountId: v.id('accounts'),
    store,
    // Secrets. Encrypt at rest before real tokens ever land here.
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(), // epoch ms
    refreshToken: v.string(),
    status: connectionStatusValidator,
    lastSyncedAt: v.optional(v.number()), // sync bookkeeping
  })
    .index('by_account', ['accountId'])
    // Natural key of the (account, store) upsert in `finishLink`.
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
    // Denormalized for ownership scoping + the subscribe cursor.
    accountId: v.id('accounts'),
    // `source` (store slug + DEDUP key `externalId`), the parsed header columns,
    // and `pdfStorageId` — the raw source of truth kept for re-parse + download.
    ...receiptContentFields,
    rawText: v.optional(v.string()),
  })
    // Dedup: at most one receipt per (connection, externalId).
    .index('by_connection_external', ['connectionId', 'externalId'])
    // Subscribe cursor: receipts for an account, ordered by _creationTime
    // (Convex appends _creationTime to every index automatically).
    .index('by_account', ['accountId']),

  // One printed line. `gtin` is the connector's deliverable, filled by its
  // per-store matcher; empty when no confident match is found (never dropped).
  receiptItems: defineTable({
    receiptId: v.id('receipts'),
    lineNo: v.number(), // preserve on-receipt order
    text: v.string(),
    price: v.number(),
    isDiscount: v.boolean(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    gtin: v.optional(v.string()), // the EAN
    matchConfidence: v.optional(v.number()), // how sure the match is
  }).index('by_receipt', ['receiptId']),
});
