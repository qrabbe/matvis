import { ConvexReactClient } from 'convex/react';

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
