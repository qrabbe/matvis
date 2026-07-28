import { ConvexReactClient } from 'convex/react';

/**
 * The catalog deployment's client — a second `ConvexReactClient`, used
 * imperatively.
 *
 * `convex/react`'s `useQuery` resolves a single client from React context, so
 * only one of the two deployments can be ambient. The connector wins it:
 * receipts are reactive and paginated, so `useQuery`/`usePaginatedQuery` earn
 * their keep there. The catalog is called through `client.query(…)` instead and
 * cached by EAN, which is the right shape anyway — a catalog row is a product
 * description that changes maybe monthly, so holding a live subscription to one
 * is waste.
 *
 * Created lazily so a missing `VITE_CATALOG_CONVEX_URL` degrades the app to
 * "receipts work, products do not" rather than blanking the whole page at boot.
 * Every product-dependent view already has to render around a near-zero match
 * rate, so it can render around this too.
 */
let client: ConvexReactClient | null = null;
let resolved = false;

export function catalogClient(): ConvexReactClient | null {
  if (!resolved) {
    resolved = true;
    const url = import.meta.env.VITE_CATALOG_CONVEX_URL as string | undefined;
    client = url ? new ConvexReactClient(url) : null;
  }
  return client;
}
