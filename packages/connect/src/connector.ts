import type {
  BankIdPoll,
  BankIdStart,
  Receipt,
  ReceiptSummary,
  TokenSet,
} from '@matvis/shared';

/**
 * The store-agnostic connector contract.
 *
 * A connector turns a grocery chain's account into normalized, GTIN-keyed
 * (EAN) result
 */
export interface Connector {
  /** Stable identifier, e.g. "coop". */
  readonly id: string;

  /** Begin authentication; returns a reference to poll on. */
  startAuth(): Promise<BankIdStart>;

  /** Poll a pending authentication once (render QR while `pending`). */
  pollAuth(orderRef: string): Promise<BankIdPoll>;

  /** Exchange a refresh token for a fresh token set. */
  refresh(refreshToken: string): Promise<TokenSet>;

  /** List the account's receipts (metadata only). */
  listReceipts(accessToken: string): Promise<ReceiptSummary[]>;

  /** Download a receipt's PDF bytes. */
  fetchReceiptPdf(accessToken: string, receiptId: string): Promise<Uint8Array>;

  /** Parse PDF bytes into a normalized receipt. */
  parseReceipt(bytes: Uint8Array): Promise<Receipt>;
}
