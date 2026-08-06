import type { StoreSlug } from '@matvis/shared';
import type { Connector } from './connector';
import { CoopConnector } from './coop/connector';
import type { FetchLike } from './http';

export interface ConnectorOptions {
  fetch?: FetchLike;
}

export type ConnectorFactory = (options?: ConnectorOptions) => Connector;

const REGISTRY: Partial<Record<StoreSlug, ConnectorFactory>> = {
  coop: (options) => new CoopConnector(options),
};

export function supportedStores(): StoreSlug[] {
  return Object.keys(REGISTRY) as StoreSlug[];
}

export function hasConnector(store: StoreSlug): boolean {
  return store in REGISTRY;
}

export function getConnector(
  store: StoreSlug,
  options?: ConnectorOptions,
): Connector {
  const factory = REGISTRY[store];
  if (!factory) throw new Error(`no connector for store "${store}"`);
  return factory(options);
}
