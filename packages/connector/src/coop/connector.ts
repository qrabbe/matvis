import type {
  BankIdPoll,
  BankIdStart,
  Receipt,
  ReceiptSummary,
  TokenSet,
} from '@matvis/shared';
import type {
  Connector,
  ParseReceiptOptions,
  StartAuthOptions,
} from '../connector';
import { defaultFetch, type FetchLike } from '../http';
import { pollBankId, refreshBankId, startBankId } from './auth/bankid';
import { DEFAULT_COOP_CONFIG, type CoopConfig } from './config';
import {
  parseCoopReceiptPdf,
  type ParseCoopReceiptOptions,
} from './parse/receipt';
import { listReceipts } from './receipts/list';
import { fetchReceiptPdf } from './receipts/pdf';

export interface CoopConnectorOptions {
  fetch?: FetchLike;
  config?: CoopConfig;
  parseOptions?: ParseCoopReceiptOptions;
}

export class CoopConnector implements Connector {
  readonly id = 'coop';
  #fetch: FetchLike;
  #config: CoopConfig;
  #parseOptions: ParseCoopReceiptOptions;

  constructor(options: CoopConnectorOptions = {}) {
    this.#fetch = options.fetch ?? defaultFetch;
    this.#config = options.config ?? DEFAULT_COOP_CONFIG;
    this.#parseOptions = options.parseOptions ?? {};
  }

  startAuth(options: StartAuthOptions = {}): Promise<BankIdStart> {
    return startBankId(this.#fetch, options, this.#config);
  }

  pollAuth(orderRef: string): Promise<BankIdPoll> {
    return pollBankId(this.#fetch, orderRef, this.#config);
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return refreshBankId(this.#fetch, refreshToken, this.#config);
  }

  listReceipts(accessToken: string): Promise<ReceiptSummary[]> {
    return listReceipts(this.#fetch, accessToken, { config: this.#config });
  }

  fetchReceiptPdf(accessToken: string, receiptId: string): Promise<Uint8Array> {
    return fetchReceiptPdf(this.#fetch, accessToken, receiptId, this.#config);
  }

  parseReceipt(
    bytes: Uint8Array,
    options: ParseReceiptOptions = {},
  ): Promise<Receipt> {
    return parseCoopReceiptPdf(bytes, { ...this.#parseOptions, ...options });
  }
}
