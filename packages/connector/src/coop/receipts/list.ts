import type { ReceiptSummary } from '@matvis/shared';
import { z } from 'zod';
import type { FetchLike } from '../../http';
import { apiHeaders, DEFAULT_COOP_CONFIG, type CoopConfig } from '../config';

/** One raw row of Coop's list endpoint (snake_case, Coop's private wire format).
 * `.nullish()` (not `.optional()`) because the API sends JSON `null` for absent
 * fields; `.optional()` would reject that and drop the whole page. */
export const CoopReceiptListRow = z.object({
  receipt_id: z.string(),
  purchase_place: z.string().nullish(),
  purchase_amount: z.number().nullish(),
  purchased_at: z.string().nullish(),
  /** Coop member/loyalty key associated with the receipt. Not part of the contract. */
  mmkid: z.string().nullish(),
});
export type CoopReceiptListRow = z.infer<typeof CoopReceiptListRow>;

/** Coop's raw list envelope: `{ data, current_page, total }`. */
export const CoopReceiptListResponse = z.object({
  // The error envelope sends `data: null`; coerce both null and a missing key
  // to `[]` so the list step doesn't throw on the very case it's meant to model.
  data: z
    .array(CoopReceiptListRow)
    .nullish()
    .transform((rows) => rows ?? []),
  current_page: z.number().optional(),
  total: z.number().optional(),
  error: z.string().optional(),
});
export type CoopReceiptListResponse = z.infer<typeof CoopReceiptListResponse>;

/** Map one raw Coop row onto the store-agnostic {@link ReceiptSummary}. */
function toSummary(row: CoopReceiptListRow): ReceiptSummary {
  return {
    id: row.receipt_id,
    purchasedAt: row.purchased_at ?? undefined,
    place: row.purchase_place ?? undefined,
    amount: row.purchase_amount ?? undefined,
  };
}

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

  const parsed = CoopReceiptListResponse.parse(await res.json());

  if (parsed.error) {
    throw new Error(`listReceipts: Coop returned error "${parsed.error}"`);
  }
  return parsed.data.map(toSummary);
}
