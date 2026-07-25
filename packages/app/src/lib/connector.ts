import { CoopConnector } from '@matvis/connector';

/**
 * The app's Coop connector, pointed at the dev proxy (see vite.config.ts)
 *
 * TODO(store #2): the server path already picks a connector by slug through
 * `getConnector` in @matvis/connector. Do the same here once a second connector
 * exists, so the UI resolves one from the store the user is linking instead of
 * hardcoding Coop. Each store needs its own proxy prefix in vite.config.ts, so
 * this stays a per-store construction, not a bare `getConnector(store)`.
 */
export const connector = new CoopConnector({
  config: { ssoBaseUrl: '/coop-sso', apiBaseUrl: '/coop-api' },
  parseOptions: { includeLoyaltyCardId: true },
});
