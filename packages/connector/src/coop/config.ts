export interface CoopConfig {
  ssoBaseUrl: string;
  apiBaseUrl: string;
}

export const COOP_HOSTS = {
  sso: 'https://sso.betala.coop.se',
  api: 'https://api.betala.coop.se',
} as const;

export const DEFAULT_COOP_CONFIG: CoopConfig = {
  ssoBaseUrl: COOP_HOSTS.sso,
  apiBaseUrl: COOP_HOSTS.api,
};

export const COOP_USER_AGENT =
  'Coop/7.17; (11604; Production; Android 16; Android Build 36; Google; sdk_gphone64_x86_64)';

export const SCANPAY_CLIENT_ID = 'scanpay';

export function ssoHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': COOP_USER_AGENT,
    'Accept-Encoding': 'gzip',
  };
}

export function apiHeaders(accessToken: string): Record<string, string> {
  return {
    'User-Agent': COOP_USER_AGENT,
    'Accept-Encoding': 'gzip',
    Authorization: `Bearer ${accessToken}`,
  };
}
