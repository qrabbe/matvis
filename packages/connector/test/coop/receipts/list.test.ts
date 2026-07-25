import { describe, expect, it } from 'bun:test';
import { listReceipts } from '../../../src/coop/receipts/list';
import { jsonResponse, stubFetch } from '../../helpers';

describe('listReceipts', () => {
  it('maps Coop snake_case rows onto the camelCase contract', async () => {
    const { fetch, calls } = stubFetch(
      jsonResponse({
        data: [
          {
            receipt_id: 'r-1',
            purchase_place: 'Stora Coop Location',
            purchase_amount: 41.95,
            purchased_at: '2026-01-02 12:00',
            mmkid: 'mmk-1',
          },
        ],
        current_page: 1,
        total: 1,
      }),
    );
    const res = await listReceipts(fetch, 'token');
    expect(res).toEqual([
      {
        id: 'r-1',
        purchasePlace: 'Stora Coop Location',
        purchaseAmount: 41.95,
        purchasedAt: '2026-01-02 12:00',
        mmkid: 'mmk-1',
      },
    ]);
    expect(calls[0]?.url).toContain('per_page=50');
    expect(calls[0]?.url).toContain('page=1');
  });

  it('throws when the envelope carries an error field', async () => {
    const { fetch } = stubFetch(jsonResponse({ data: [], error: 'nope' }));
    await expect(listReceipts(fetch, 'token')).rejects.toThrow('nope');
  });

  it('throws on a non-ok response', async () => {
    const { fetch } = stubFetch(jsonResponse({}, { ok: false, status: 401 }));
    await expect(listReceipts(fetch, 'token')).rejects.toThrow(
      'listReceipts failed',
    );
  });
});
