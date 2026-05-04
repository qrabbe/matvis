import { describe, expect, it } from 'bun:test';
import {
  isAccessTokenValid,
  pollBankId,
  refreshBankId,
  startBankId,
  toTokenSet,
} from '../../../src/coop/auth/bankid';
import { jsonResponse, stubFetch } from '../../helpers';

const NOW = 1_700_000_000_000;

describe('toTokenSet', () => {
  it('converts relative expiry to absolute ms timestamps', () => {
    const set = toTokenSet(
      {
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 300,
        refresh_expires_in: 3600,
      },
      NOW,
    );
    expect(set.accessToken).toBe('a');
    expect(set.refreshToken).toBe('r');
    expect(set.obtainedAt).toBe(NOW);
    expect(set.expiresAt).toBe(NOW + 300_000);
    expect(set.refreshExpiresAt).toBe(NOW + 3_600_000);
  });

  it('uses 0 expiry when expires_in is absent, and drops missing refresh expiry', () => {
    const set = toTokenSet({ access_token: 'a', refresh_token: 'r' }, NOW);
    expect(set.expiresAt).toBe(0);
    expect(set.refreshExpiresAt).toBeUndefined();
  });
});

describe('isAccessTokenValid', () => {
  it('treats 0 expiry as always valid', () => {
    expect(isAccessTokenValid({ expiresAt: 0 } as never, NOW)).toBe(true);
  });
  it('is valid before expiry and invalid after', () => {
    expect(isAccessTokenValid({ expiresAt: NOW + 1000 } as never, NOW)).toBe(
      true,
    );
    expect(isAccessTokenValid({ expiresAt: NOW - 1000 } as never, NOW)).toBe(
      false,
    );
  });
});

describe('startBankId', () => {
  it('returns orderRef + autoStartToken and posts to the scanpay token endpoint', async () => {
    const { fetch, calls } = stubFetch(
      jsonResponse({ orderRef: 'order-1', autoStartToken: 'ast-1' }),
    );
    const res = await startBankId(fetch);
    expect(res).toEqual({ orderRef: 'order-1', autoStartToken: 'ast-1' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('origin=scanpay');
    expect(calls[0]?.body).toContain('client_id=scanpay');
  });

  it('throws when the response has no orderRef', async () => {
    const { fetch } = stubFetch(jsonResponse({}));
    await expect(startBankId(fetch)).rejects.toThrow('orderRef');
  });

  it('throws on a non-ok response', async () => {
    const { fetch } = stubFetch(jsonResponse({}, { ok: false, status: 500 }));
    await expect(startBankId(fetch)).rejects.toThrow('startBankId failed');
  });
});

describe('pollBankId', () => {
  it('returns pending with the current QR and hint', async () => {
    const { fetch } = stubFetch(
      jsonResponse({ qrCode: 'qr-frame', hintCode: 'userSign' }),
    );
    expect(await pollBankId(fetch, 'order-1')).toEqual({
      status: 'pending',
      qrCode: 'qr-frame',
      hintCode: 'userSign',
    });
  });

  it('returns complete with a normalized token set', async () => {
    const { fetch } = stubFetch(
      jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 60 }),
    );
    const res = await pollBankId(fetch, 'order-1');
    expect(res.status).toBe('complete');
    if (res.status === 'complete') expect(res.tokens.accessToken).toBe('a');
  });

  it('returns failed with the error and hint', async () => {
    const { fetch } = stubFetch(
      jsonResponse({ error: 'access_denied', hintCode: 'userCancel' }),
    );
    expect(await pollBankId(fetch, 'order-1')).toEqual({
      status: 'failed',
      error: 'access_denied',
      hintCode: 'userCancel',
    });
  });

  it('returns failed on a non-ok response', async () => {
    const { fetch } = stubFetch(jsonResponse({}, { ok: false, status: 502 }));
    const res = await pollBankId(fetch, 'order-1');
    expect(res.status).toBe('failed');
  });
});

describe('refreshBankId', () => {
  it('exchanges a refresh token for a fresh set', async () => {
    const { fetch, calls } = stubFetch(
      jsonResponse({ access_token: 'a2', refresh_token: 'r2', expires_in: 60 }),
    );
    const set = await refreshBankId(fetch, 'old-refresh');
    expect(set.accessToken).toBe('a2');
    expect(calls[0]?.body).toContain('grant_type=refresh_token');
    expect(calls[0]?.body).toContain('refresh_token=old-refresh');
  });

  it('throws on a non-ok response', async () => {
    const { fetch } = stubFetch(jsonResponse({}, { ok: false, status: 400 }));
    await expect(refreshBankId(fetch, 'x')).rejects.toThrow(
      'refreshBankId failed',
    );
  });
});
