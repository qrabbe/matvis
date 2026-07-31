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

// ── Typed facade over the connector's public READ API ────────────────────────
// Same technique as the two portals: the app is a separate package from
// @matvis/connector, where the Convex backend and its `convex dev`-generated
// `_generated/api` live, and importing that generated `api` drags the
// connector's whole convex/ + src/ TS program into THIS package's typecheck.
// So we call the deployment through Convex's runtime `anyApi` proxy (it builds
// valid path-based references — `anyApi.receipts.list` → "receipts:list") and
// layer static types on top. The document shapes come from @matvis/shared, the
// same source of truth the server's validators mirror.
//
// QUERIES ONLY, deliberately. Every declaration below is
// `FunctionReference<'query', …>`, so there is no mutation or action the app can
// name, let alone call. Together with `main.tsx` never mounting an auth provider
// — every connector write resolves the caller through `getAuthUserId` and throws
// `Unauthenticated` without a session — the app is read-only by construction
// rather than by convention. Adding a write here is a visible, reviewable act.

// Every read takes the account API `token`: the read is scoped by that token
// alone, with no login. The app always passes it — it has no session to fall
// back on.
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

/** The connector's public read API, statically typed, backed by the runtime proxy. */
export const api = anyApi as unknown as ConnectorReadApi;
