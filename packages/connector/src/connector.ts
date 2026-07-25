import type {
  BankIdPoll,
  BankIdStart,
  Receipt,
  ReceiptSummary,
  StoreSlug,
  TokenSet,
} from '@matvis/shared';

/** How an authentication is started. Store-agnostic BankID flow selection. */
export interface StartAuthOptions {
  /**
   * `true` = same-device flow (the start or poll carries an autostart token for
   * a `bankid://` deep link); default/`false` = cross-device flow (poll yields a
   * QR to scan).
   */
  sameDevice?: boolean;
}

/**
 * Which optional fields a parsed receipt carries. Both map to optional fields
 * on the shared `Receipt`, so they are store-agnostic.
 */
export interface ParseReceiptOptions {
  /** Include the parsed loyalty/membership number. */
  includeLoyaltyCardId?: boolean;
  /** Attach the raw extracted text to `Receipt.rawText` for debugging. */
  includeRawText?: boolean;
}

/**
 * The store-agnostic connector contract.
 *
 * A connector turns a grocery chain's account into normalized, GTIN-keyed
 * (EAN) result
 */
export interface Connector {
  /** Stable identifier, e.g. "coop". Matches its key in the registry. */
  readonly id: StoreSlug;

  /** Begin authentication; returns a reference to poll on. */
  startAuth(options?: StartAuthOptions): Promise<BankIdStart>;

  /** Poll a pending authentication once (render QR while `pending`). */
  pollAuth(orderRef: string): Promise<BankIdPoll>;

  /** Exchange a refresh token for a fresh token set. */
  refresh(refreshToken: string): Promise<TokenSet>;

  /** List the account's receipts (metadata only). */
  listReceipts(accessToken: string): Promise<ReceiptSummary[]>;

  /** Download a receipt's PDF bytes. */
  fetchReceiptPdf(accessToken: string, receiptId: string): Promise<Uint8Array>;

  /** Parse PDF bytes into a normalized receipt. */
  parseReceipt(
    bytes: Uint8Array,
    options?: ParseReceiptOptions,
  ): Promise<Receipt>;
}
