import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { anyApi } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { Receipt, StoreSlug } from '@matvis/shared';

// ── Typed facade over the connector's public Convex API ──────────────────────
// The portal is a separate package from @matvis/connect, where the Convex
// backend and its `convex dev`-generated `_generated/api` live. Importing that
// generated `api` directly drags connect's whole convex/ + src/ TS program into
// THIS package's typecheck — it chains through `import type * as links from
// "../links.js"` — which breaks composite `rootDir` and applies the portal's
// stricter tsconfig to code it doesn't own.
//
// Instead we call the deployment through Convex's runtime `anyApi` proxy (it
// builds valid path-based function references — `anyApi.receipts.list` →
// "receipts:list") and layer static types on top via the cast below. The data
// shapes are derived from @matvis/shared's `Receipt` (the SAME single source of
// truth the server's validators mirror), so the UI can't drift on the receipt
// contract. Only the thin function-signature layer is hand-written; keep it in
// step with packages/connect/convex/{links,sync,receipts}.ts.

/** A stored `receipts` header row (no `items`, no `rawText`), as the read API returns it. */
export type ReceiptHeader = Omit<Receipt, 'items' | 'rawText'> & {
  _id: GenericId<'receipts'>;
  _creationTime: number;
  connectionId: GenericId<'connections'>;
  accountId: GenericId<'accounts'>;
  externalId: string;
  purchasedAtMs?: number;
  pdfStorageId?: GenericId<'_storage'>;
};

/** A full stored `receiptItems` document, as `getReceipt` returns it. */
export type ReceiptItemDoc = {
  _id: GenericId<'receiptItems'>;
  _creationTime: number;
  receiptId: GenericId<'receipts'>;
  lineNo: number;
  text: string;
  price: number;
  isDiscount: boolean;
  quantity?: number;
  unit?: string;
  gtin?: string;
};

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
  { paginationOpts: PaginationOptions },
  PaginationResult<ReceiptHeader>
>;

type ReceiptsGetReceipt = FunctionReference<
  'query',
  'public',
  { receiptId: GenericId<'receipts'> },
  { receipt: ReceiptHeader; items: ReceiptItemDoc[] } | null
>;

type ReceiptsGetPdf = FunctionReference<
  'query',
  'public',
  { receiptId: GenericId<'receipts'> },
  string | null
>;

type ReceiptsChanges = FunctionReference<
  'query',
  'public',
  { since: number; limit?: number },
  { receipts: ReceiptHeader[]; cursor: number; hasMore: boolean }
>;

type ConnectorApi = {
  links: { start: LinkStart; poll: LinkPoll };
  sync: { sync: SyncSync };
  receipts: {
    list: ReceiptsList;
    getReceipt: ReceiptsGetReceipt;
    getPdf: ReceiptsGetPdf;
    changes: ReceiptsChanges;
  };
};

/** The connector's public API, statically typed, backed by the runtime proxy. */
export const api = anyApi as unknown as ConnectorApi;

/** Convex document id, e.g. `Id<'connections'>`. */
export type Id<TableName extends string> = GenericId<TableName>;
