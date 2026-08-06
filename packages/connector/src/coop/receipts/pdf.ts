import type { FetchLike } from '../../http';
import { apiHeaders, DEFAULT_COOP_CONFIG, type CoopConfig } from '../config';

export async function fetchReceiptPdf(
  fetchImpl: FetchLike,
  accessToken: string,
  receiptId: string,
  config: CoopConfig = DEFAULT_COOP_CONFIG,
): Promise<Uint8Array> {
  const url = `${config.apiBaseUrl}/kvitto/rest/receipts/v1/${encodeURIComponent(
    receiptId,
  )}/formalReceipt`;

  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      ...apiHeaders(accessToken),
      accept: 'application/pdf;q=0.9,application/json;q=0.1',
    },
  });
  if (!res.ok) {
    throw new Error(
      `fetchReceiptPdf(${receiptId}) failed: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
