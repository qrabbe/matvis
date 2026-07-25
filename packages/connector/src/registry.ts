import type { StoreSlug } from '@matvis/shared';
import type { Connector } from './connector';
import { CoopConnector } from './coop/connector';
import type { FetchLike } from './http';

// The one place a store slug is turned into a running connector. Everything on
// the server path (the sync engine, the link actions) resolves through here, so
// adding a chain is a new `Connector` implementation plus one entry below.

/** What every connector accepts at construction, whatever store it targets. */
export interface ConnectorOptions {
  /** Transport. Defaults to the global `fetch`; the browser injects a proxy. */
  fetch?: FetchLike;
}

/** Builds a connector for one store. */
export type ConnectorFactory = (options?: ConnectorOptions) => Connector;

/**
 * Slug → factory. Partial on purpose: most of `STORES` are reserved slugs with
 * no connector built yet, and asking for one of those is an error, not a
 * silently missing store.
 */
const REGISTRY: Partial<Record<StoreSlug, ConnectorFactory>> = {
  coop: (options) => new CoopConnector(options),
};

/** Store slugs that have a connector today, in registry order. */
export function supportedStores(): StoreSlug[] {
  return Object.keys(REGISTRY) as StoreSlug[];
}

/** True when `store` has a connector implementation. */
export function hasConnector(store: StoreSlug): boolean {
  return store in REGISTRY;
}

/**
 * Build the connector for `store`. Throws for a reserved slug that has no
 * implementation yet, so an unbuilt store fails loudly at the call site rather
 * than as a later undefined-method error.
 */
export function getConnector(
  store: StoreSlug,
  options?: ConnectorOptions,
): Connector {
  const factory = REGISTRY[store];
  if (!factory) throw new Error(`no connector for store "${store}"`);
  return factory(options);
}
