// @matvis/connector
// store connectors that turn accounts into normalized results.
// Inject a `FetchLike` (see ./http) to run it anywhere.

export type { FetchLike, HttpResponse } from './http';
export { defaultFetch } from './http';

export type {
  Connector,
  ParseReceiptOptions,
  StartAuthOptions,
} from './connector';

// Store selection: slug → connector.
export { getConnector, hasConnector, supportedStores } from './registry';
export type { ConnectorFactory, ConnectorOptions } from './registry';

// Matching: the aggressive cleanup on top of @matvis/shared's lookup key.
export { stripQuantitySuffix } from './matching';

// Token encryption at rest
export {
  decryptSecret,
  decryptTokenPair,
  encryptSecret,
  encryptTokenPair,
  generateTokenKey,
  importTokenKey,
  TOKEN_KEY_ENV_VAR,
  TOKEN_KEY_VERSION,
  tokenEncryptionKey,
} from './crypto';
export type { EncryptedSecret } from './crypto';

// Coop connector
export { CoopConnector } from './coop/connector';
export type { CoopConnectorOptions } from './coop/connector';
export {
  COOP_HOSTS,
  COOP_USER_AGENT,
  DEFAULT_COOP_CONFIG,
  SCANPAY_CLIENT_ID,
} from './coop/config';
export type { CoopConfig } from './coop/config';
export {
  pollBankId,
  refreshBankId,
  startBankId,
  toTokenSet,
} from './coop/auth/bankid';
export {
  CoopReceiptListResponse,
  CoopReceiptListRow,
  listReceipts,
} from './coop/receipts/list';
export { fetchReceiptPdf } from './coop/receipts/pdf';
export { extractPdfText } from './coop/parse/extract-pdf';
export {
  extractPurchaseItemLines,
  parseCoopReceiptItems,
} from './coop/parse/items';
export { parseCoopReceiptMetadata } from './coop/parse/metadata';
export type { CoopReceiptMetadata } from './coop/parse/metadata';
export { parseCoopReceipt, parseCoopReceiptPdf } from './coop/parse/receipt';
export type { ParseCoopReceiptOptions } from './coop/parse/receipt';
