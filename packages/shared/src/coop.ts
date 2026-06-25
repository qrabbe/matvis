import { z } from 'zod';

/** One receipt entry from the list endpoint. Metadata only. Items live in the PDF. */
export const ReceiptSummary = z.object({
  /** Coop's receipt id. Pass to the download endpoint. */
  id: z.string(),
  // `.nullish()` (not `.optional()`) because the raw API sends JSON `null` for
  // absent fields; `.optional()` would reject that and drop the whole page.
  purchasePlace: z.string().nullish(),
  purchaseAmount: z.number().nullish(),
  purchasedAt: z.string().nullish(),
  /** Coop member/loyalty key associated with the receipt. */
  mmkid: z.string().nullish(),
});
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;

/** Raw list endpoint envelope: `{ data, current_page, total }`. */
export const ReceiptListResponse = z.object({
  // The error envelope sends `data: null`; coerce both null and a missing key
  // to `[]` so the list step doesn't throw on the very case it's meant to model.
  data: z
    .array(ReceiptSummary)
    .nullish()
    .transform((rows) => rows ?? []),
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
  /**
   * ms epoch when the access token expires. Sentinel `0` = no known expiry and
   * is treated as non-expiring (see `isAccessTokenValid`) — never do arithmetic
   * on it or compare it as a real timestamp.
   */
  expiresAt: z.number().default(0),
  /** ms epoch when the refresh token expires, if known. */
  refreshExpiresAt: z.number().optional(),
  /** ms epoch when this set was obtained. Informational only (never read for expiry math). */
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
