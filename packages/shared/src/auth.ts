import { z } from 'zod';

export const TokenSet = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  idToken: z.string().optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
  /** Sentinel `0` means no known expiry, so never do arithmetic on it or
   * compare it as a real timestamp. */
  expiresAt: z.number().default(0),
  refreshExpiresAt: z.number().optional(),
  obtainedAt: z.number().default(0),
});
export type TokenSet = z.infer<typeof TokenSet>;

export function isAccessTokenValid(
  tokens: Pick<TokenSet, 'expiresAt'>,
  now = Date.now(),
): boolean {
  return tokens.expiresAt === 0 ? true : tokens.expiresAt > now;
}

export const BankIdStart = z.object({
  orderRef: z.string(),
  autoStartToken: z.string().optional(),
});
export type BankIdStart = z.infer<typeof BankIdStart>;

export const BankIdPoll = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    qrCode: z.string().optional(),
    hintCode: z.string().optional(),
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
