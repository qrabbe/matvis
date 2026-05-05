import { CoopConnector } from '@matvis/connect';

/**
 * The app's Coop connector, pointed at the dev proxy (see vite.config.ts)
 */
export const connector = new CoopConnector({
  config: { ssoBaseUrl: '/coop-sso', apiBaseUrl: '/coop-api' },
  parseOptions: { includeLoyaltyCardId: true },
});
