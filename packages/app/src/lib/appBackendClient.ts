import { ConvexReactClient } from 'convex/react';

let client: ConvexReactClient | null = null;
let resolved = false;

/** A second Convex client alongside the connector's — app's own backend is a
 * different deployment, so it needs its own connection, even though (unlike
 * connector/catalog) its generated API can be imported directly, since it
 * now lives in this same package. */
export function appBackendClient(): ConvexReactClient | null {
  if (!resolved) {
    resolved = true;
    const url = import.meta.env.VITE_APP_CONVEX_URL as string | undefined;
    client = url ? new ConvexReactClient(url) : null;
  }
  return client;
}
