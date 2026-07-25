import { z } from 'zod';

/**
 * Store-agnostic authentication contracts. BankID is Sweden-wide, so these are
 * national shapes, not Coop's: every chain that logs in with BankID reuses them.
 */

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

/** True when an access token with absolute `expiresAt` (epoch ms) is still
 * valid at `now`. `expiresAt: 0` means no expiry (always valid). */
export function isAccessTokenValid(
  tokens: Pick<TokenSet, 'expiresAt'>,
  now = Date.now(),
): boolean {
  return tokens.expiresAt === 0 ? true : tokens.expiresAt > now;
}

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
