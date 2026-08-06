import type {
  BankIdPoll,
  BankIdStart,
  Receipt,
  ReceiptSummary,
  StoreSlug,
  TokenSet,
} from '@matvis/shared';

export interface StartAuthOptions {
  sameDevice?: boolean;
}

export interface ParseReceiptOptions {
  includeLoyaltyCardId?: boolean;
  includeRawText?: boolean;
}

export interface Connector {
  readonly id: StoreSlug;

  startAuth(options?: StartAuthOptions): Promise<BankIdStart>;

  pollAuth(orderRef: string): Promise<BankIdPoll>;

  refresh(refreshToken: string): Promise<TokenSet>;

  listReceipts(accessToken: string): Promise<ReceiptSummary[]>;

  fetchReceiptPdf(accessToken: string, receiptId: string): Promise<Uint8Array>;

  parseReceipt(
    bytes: Uint8Array,
    options?: ParseReceiptOptions,
  ): Promise<Receipt>;
}
