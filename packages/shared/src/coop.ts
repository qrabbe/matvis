import { z } from 'zod';

/** One receipt entry from the list endpoint. Metadata only. Items live in the PDF. */
export const ReceiptSummary = z.object({
  /** Coop's receipt id. Pass to the download endpoint. */
  id: z.string(),
  purchasePlace: z.string().optional(),
  purchaseAmount: z.number().optional(),
  purchasedAt: z.string().optional(),
  /** Coop member/loyalty key associated with the receipt. */
  mmkid: z.string().optional(),
});
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;

/** Raw list endpoint envelope: `{ data, current_page, total }`. */
export const ReceiptListResponse = z.object({
  data: z.array(ReceiptSummary).default([]),
  current_page: z.number().optional(),
  total: z.number().optional(),
  error: z.string().optional(),
});
export type ReceiptListResponse = z.infer<typeof ReceiptListResponse>;

/** OAuth token set with absolute expiry timestamps (ms epoch). */
export const TokenSet = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  idToken: z.string().optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
  /** ms epoch when the access token expires (0 = unknown/none). */
  expiresAt: z.number().default(0),
  /** ms epoch when the refresh token expires, if known. */
  refreshExpiresAt: z.number().optional(),
  /** ms epoch when this set was obtained. */
  obtainedAt: z.number().default(0),
});
export type TokenSet = z.infer<typeof TokenSet>;

/** Result of starting a BankID login. */
export const BankIdStart = z.object({
  /** The reference to poll against. */
  orderRef: z.string(),
  /** When present, lets the same device open the BankID app directly. */
  autoStartToken: z.string().optional(),
});
export type BankIdStart = z.infer<typeof BankIdStart>;

/** A BankID progress hint. Open string so unknown codes don't break validation. */
export type BankIdHintCode = string;

/** The outcome of a single BankID poll, discriminated on `status`. */
export const BankIdPoll = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    qrCode: z.string().optional(),
    hintCode: z.string().optional(),
    /** Same-device: present if the poll (not the start) carries the autostart token. */
    autoStartToken: z.string().optional(),
  }),
  z.object({
    status: z.literal('complete'),
    tokens: TokenSet,
  }),
  z.object({
    status: z.literal('failed'),
    error: z.string().optional(),
    hintCode: z.string().optional(),
  }),
]);
export type BankIdPoll = z.infer<typeof BankIdPoll>;

/** Named BankID tokens as stored, mirroring the original `external_api_tokens`. */
export const BankIdTokenName = z.enum([
  'bank_id_access_token',
  'bank_id_refresh_token',
  'bank_id_id_token',
]);
export type BankIdTokenName = z.infer<typeof BankIdTokenName>;
