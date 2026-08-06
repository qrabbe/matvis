import type { BankIdPoll, BankIdStart, TokenSet } from '@matvis/shared';
import { assertOk, type FetchLike } from '../../http';
import {
  DEFAULT_COOP_CONFIG,
  SCANPAY_CLIENT_ID,
  ssoHeaders,
  type CoopConfig,
} from '../config';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  scope?: string;
  session_state?: string;
}

const BASE_BODY: Record<string, string> = {
  grant_type: 'password',
  scope: 'openid offline_access',
  username: '',
  response_type: 'id_token token',
  client_id: SCANPAY_CLIENT_ID,
};

const POLL_BODY: Record<string, string> = {
  ...BASE_BODY,
  required_personal_number: '',
  user_visible_data: '',
};

const AUTOSTART_TOKEN_KEYS = ['autostarttoken'] as const;

function tokenUrl(config: CoopConfig, query?: Record<string, string>): string {
  const params = new URLSearchParams({ origin: 'scanpay', ...query });
  return `${config.ssoBaseUrl}/auth/realms/coop/protocol/openid-connect/token?${params}`;
}

export function toTokenSet(
  raw: KeycloakTokenResponse,
  now = Date.now(),
): TokenSet {
  const expiresIn = raw.expires_in ?? 0;
  const refreshExpiresIn = raw.refresh_expires_in;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? '',
    idToken: raw.id_token,
    tokenType: raw.token_type,
    scope: raw.scope,
    obtainedAt: now,
    expiresAt: expiresIn > 0 ? now + expiresIn * 1000 : 0,
    refreshExpiresAt:
      refreshExpiresIn && refreshExpiresIn > 0
        ? now + refreshExpiresIn * 1000
        : undefined,
  };
}

export async function startBankId(
  fetchImpl: FetchLike,
  opts: { sameDevice?: boolean } = {},
  config: CoopConfig = DEFAULT_COOP_CONFIG,
): Promise<BankIdStart> {
  const res = await fetchImpl(tokenUrl(config), {
    method: 'POST',
    headers: ssoHeaders(),
    body: new URLSearchParams({
      ...BASE_BODY,
      other_device: opts.sameDevice ? 'false' : 'true',
    }).toString(),
  });
  assertOk(res, 'startBankId');
  const json = (await res.json()) as Record<string, unknown>;
  const autoStartToken = firstString(json, AUTOSTART_TOKEN_KEYS);
  const orderRef = firstString(json, ['orderRef', 'order_ref']);
  if (!orderRef) {
    console.error(
      'startBankId: no orderRef; response keys =',
      Object.keys(json),
    );
    throw new Error('startBankId: response did not contain an orderRef');
  }
  if (opts.sameDevice && !autoStartToken) {
    console.error(
      'startBankId(sameDevice): no autostart token; response keys =',
      Object.keys(json),
    );
  }
  return { orderRef, autoStartToken };
}

function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export async function pollBankId(
  fetchImpl: FetchLike,
  orderRef: string,
  config: CoopConfig = DEFAULT_COOP_CONFIG,
): Promise<BankIdPoll> {
  const res = await fetchImpl(tokenUrl(config, { orderRef }), {
    method: 'POST',
    headers: ssoHeaders(),
    body: new URLSearchParams(POLL_BODY).toString(),
  });

  if (!res.ok) {
    return {
      status: 'failed',
      error: `poll failed: ${res.status} ${res.statusText}`,
    };
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json.access_token === 'string') {
    return {
      status: 'complete',
      tokens: toTokenSet(json as unknown as KeycloakTokenResponse),
    };
  }
  if (json.error) {
    return {
      status: 'failed',
      error: String(json.error),
      hintCode: json.hintCode as string | undefined,
    };
  }
  const autoStartToken = firstString(json, AUTOSTART_TOKEN_KEYS);
  return {
    status: 'pending',
    qrCode: json.qrCode as string | undefined,
    hintCode: json.hintCode as string | undefined,
    autoStartToken,
  };
}

export async function refreshBankId(
  fetchImpl: FetchLike,
  refreshToken: string,
  config: CoopConfig = DEFAULT_COOP_CONFIG,
): Promise<TokenSet> {
  const res = await fetchImpl(tokenUrl(config), {
    method: 'POST',
    headers: ssoHeaders(),
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SCANPAY_CLIENT_ID,
    }).toString(),
  });
  assertOk(res, 'refreshBankId');
  return toTokenSet((await res.json()) as KeycloakTokenResponse);
}
