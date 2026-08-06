import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { anyApi } from 'convex/server';
import type { GenericId } from 'convex/values';
import type {
  ConnectionPublic,
  ReceiptHeader,
  ReceiptItemDoc,
  StoreSlug,
} from '@matvis/shared';

type LinkStart = FunctionReference<
  'action',
  'public',
  { store: StoreSlug; sameDevice?: boolean },
  {
    pendingLinkId: GenericId<'pendingLinks'>;
    orderRef: string;
    autoStartToken?: string;
  }
>;

type LinkPoll = FunctionReference<
  'action',
  'public',
  { pendingLinkId: GenericId<'pendingLinks'> },
  | { status: 'pending'; qrCode?: string; autoStartToken?: string }
  | { status: 'complete'; connectionId: GenericId<'connections'> }
  | { status: 'failed'; error?: string }
>;

type SyncSync = FunctionReference<
  'action',
  'public',
  { connectionId: GenericId<'connections'> },
  { synced: number; skipped: number; status: 'active' | 'needs_reauth' }
>;

type ReceiptsList = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions; token?: string },
  PaginationResult<ReceiptHeader>
>;

type ReceiptsGetReceipt = FunctionReference<
  'query',
  'public',
  { receiptId: GenericId<'receipts'>; token?: string },
  { receipt: ReceiptHeader; items: ReceiptItemDoc[] } | null
>;

type ReceiptsGetPdf = FunctionReference<
  'query',
  'public',
  { receiptId: GenericId<'receipts'>; token?: string },
  string | null
>;

type ReceiptsChanges = FunctionReference<
  'query',
  'public',
  { since: number; limit?: number; token?: string },
  { receipts: ReceiptHeader[]; cursor: number; hasMore: boolean }
>;

type ConnectionsList = FunctionReference<
  'query',
  'public',
  { token?: string },
  ConnectionPublic[]
>;

type AccessTokenGet = FunctionReference<'query', 'public', {}, string | null>;
type AccessTokenCreate = FunctionReference<'mutation', 'public', {}, string>;

type ConnectorApi = {
  links: { start: LinkStart; poll: LinkPoll };
  sync: { sync: SyncSync };
  accessToken: { get: AccessTokenGet; create: AccessTokenCreate };
  connections: { list: ConnectionsList };
  receipts: {
    list: ReceiptsList;
    getReceipt: ReceiptsGetReceipt;
    getPdf: ReceiptsGetPdf;
    changes: ReceiptsChanges;
  };
};

export const api = anyApi as unknown as ConnectorApi;

export type Id<TableName extends string> = GenericId<TableName>;
