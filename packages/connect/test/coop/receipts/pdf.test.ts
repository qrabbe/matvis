import { describe, expect, it } from 'bun:test';
import { fetchReceiptPdf } from '../../../src/coop/receipts/pdf';
import { bytesResponse, jsonResponse, stubFetch } from '../../helpers';

describe('fetchReceiptPdf', () => {
  it('returns the PDF bytes', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const { fetch } = stubFetch(bytesResponse(pdf));
    const bytes = await fetchReceiptPdf(fetch, 'token', 'r-1');
    expect(Array.from(bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it('URL-encodes the receipt id into the path', async () => {
    const { fetch, calls } = stubFetch(bytesResponse(new Uint8Array()));
    await fetchReceiptPdf(fetch, 'token', 'a/b?c');
    expect(calls[0]?.url).toContain('/a%2Fb%3Fc/formalReceipt');
  });

  it('throws on a non-ok response', async () => {
    const { fetch } = stubFetch(jsonResponse({}, { ok: false, status: 404 }));
    await expect(fetchReceiptPdf(fetch, 'token', 'r-1')).rejects.toThrow(
      'fetchReceiptPdf(r-1) failed',
    );
  });
});
