import { describe, expect, it } from 'bun:test';
import { parseCoopReceiptMetadata } from '../../../src/coop/parse/metadata';
import { fixture } from '../../helpers';

describe('parseCoopReceiptMetadata', () => {
  it('parses store identity, labelled fields, and the VAT row', () => {
    const meta = parseCoopReceiptMetadata(fixture('simple.txt'));
    expect(meta.store).toEqual({
      name: 'Stora Coop Location',
      postalCode: '12345',
      city: 'Staden',
      phone: '070-1234567',
      orgNr: '5560001234',
    });
    expect(meta.receiptNumber).toBe('100000-001-00001');
    expect(meta.purchasedAt).toBe('2025-01-01T12:00:00'); // "Datum" → ISO
    expect(meta.cashier).toBe('9');
    expect(meta.total).toBe(32.95);
    expect(meta.itemCount).toBe(2);
    expect(meta.pointsAmount).toBe(32.95);
    expect(meta.loyaltyCardId).toBe('1234567');
    expect(meta.vat).toEqual([
      { rate: 12, vat: 3.53, net: 29.42, gross: 32.95 },
    ]);
  });

  it('parses legal entity, receipt type, and discounts total when present', () => {
    const meta = parseCoopReceiptMetadata(fixture('discounts.txt'));
    expect(meta.store.legalEntity).toBe('Coop Region ekonomisk förening');
    expect(meta.receiptType).toBe('Elektroniskt kassakvitto');
    expect(meta.discountsTotal).toBe(5);
  });

  it('leaves absent fields undefined and never throws', () => {
    const meta = parseCoopReceiptMetadata('Some Store\nSomething 1,00\n');
    expect(meta.store.name).toBe('Some Store');
    expect(meta.total).toBeUndefined();
    expect(meta.receiptNumber).toBeUndefined();
    expect(meta.loyaltyCardId).toBeUndefined();
    expect(meta.vat).toEqual([]);
  });
});
