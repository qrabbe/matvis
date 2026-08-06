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
} from '@matvis/shared';

// @matvis/connector, where the Convex backend and its `convex dev`-generated

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

type ConnectionsList = FunctionReference<
  'query',
  'public',
  { token?: string },
  ConnectionPublic[]
>;

type ConnectorReadApi = {
  connections: { list: ConnectionsList };
  receipts: {
    list: ReceiptsList;
    getReceipt: ReceiptsGetReceipt;
    getPdf: ReceiptsGetPdf;
  };
};

export const api = anyApi as unknown as ConnectorReadApi;
