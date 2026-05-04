/**
 * Coop endpoint config
 */
export interface CoopConfig {
  /** Base for the BankID/Keycloak SSO token endpoint (no trailing slash). */
  ssoBaseUrl: string;
  /** Base for the Coop receipts API (no trailing slash). */
  apiBaseUrl: string;
}

/** Real Coop hosts */
export const COOP_HOSTS = {
  sso: 'https://sso.betala.coop.se',
  api: 'https://api.betala.coop.se',
} as const;

export const DEFAULT_COOP_CONFIG: CoopConfig = {
  ssoBaseUrl: COOP_HOSTS.sso,
  apiBaseUrl: COOP_HOSTS.api,
};

/**
 * The Coop Android app's User-Agent, which Coop's endpoints expect. Browsers
 * forbid this header, so the browser transport relies on the proxy to re-add it.
 */
export const COOP_USER_AGENT =
  'Coop/7.17; (11604; Production; Android 16; Android Build 36; Google; sdk_gphone64_x86_64)';

/** OAuth client id used for the BankID ("scanpay") flow. */
export const SCANPAY_CLIENT_ID = 'scanpay';

/** Common headers for the SSO/BankID token endpoint. */
export function ssoHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': COOP_USER_AGENT,
    'Accept-Encoding': 'gzip',
  };
}

/** Common headers for the receipts API, with a bearer access token. */
export function apiHeaders(accessToken: string): Record<string, string> {
  return {
    'User-Agent': COOP_USER_AGENT,
    'Accept-Encoding': 'gzip',
    Authorization: `Bearer ${accessToken}`,
  };
}
