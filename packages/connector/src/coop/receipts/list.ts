import { ReceiptListResponse, type ReceiptSummary } from '@matvis/shared';
import type { FetchLike } from '../../http';
import { apiHeaders, DEFAULT_COOP_CONFIG, type CoopConfig } from '../config';

/**
 * List the caller's receipts (metadata only), authenticating with the BankID
 * access token. Coop returns snake_case (`receipt_id`, `purchase_place`, …)
 */
export async function listReceipts(
  fetchImpl: FetchLike,
  accessToken: string,
  options: { perPage?: number; page?: number; config?: CoopConfig } = {},
): Promise<ReceiptSummary[]> {
  const { perPage = 50, page = 1, config = DEFAULT_COOP_CONFIG } = options;
  const url = `${config.apiBaseUrl}/kvitto/rest/receipts/v1?per_page=${perPage}&page=${page}`;

  const res = await fetchImpl(url, {
    method: 'GET',
    headers: apiHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`listReceipts failed: ${res.status} ${res.statusText}`);
  }

  const raw = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    current_page?: number;
    total?: number;
    error?: string;
  };

  const parsed = ReceiptListResponse.parse({
    data: (raw.data ?? []).map((r) => ({
      id: r['receipt_id'],
      purchasePlace: r['purchase_place'],
      purchaseAmount: r['purchase_amount'],
      purchasedAt: r['purchased_at'],
      mmkid: r['mmkid'],
    })),
    current_page: raw.current_page,
    total: raw.total,
    error: raw.error,
  });

  if (parsed.error) {
    throw new Error(`listReceipts: Coop returned error "${parsed.error}"`);
  }
  return parsed.data;
}
