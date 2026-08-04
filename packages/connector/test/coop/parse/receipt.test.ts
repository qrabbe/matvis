import { describe, expect, it } from 'bun:test';
import { parseCoopReceipt } from '../../../src/coop/parse/receipt';
import { fixture } from '../../helpers';

describe('parseCoopReceipt (assembly + validation)', () => {
  it('assembles a validated Receipt from receipt text', () => {
    const r = parseCoopReceipt(fixture('simple.txt'));
    expect(r.source).toBe('coop');
    expect(r.currency).toBe('SEK');
    expect(r.store.name).toBe('Stora Coop Location');
    expect(r.total).toBe(32.95);
    expect(r.itemCount).toBe(2);
    expect(r.items).toHaveLength(2);
  });

  it('gates loyaltyCardId behind includeLoyaltyCardId', () => {
    const text = fixture('simple.txt');
    expect(parseCoopReceipt(text).loyaltyCardId).toBeUndefined();
    expect(
      parseCoopReceipt(text, { includeLoyaltyCardId: true }).loyaltyCardId,
    ).toBe('1234567');
  });

  it('gates rawText behind includeRawText', () => {
    const text = fixture('simple.txt');
    expect(parseCoopReceipt(text).rawText).toBeUndefined();
    expect(parseCoopReceipt(text, { includeRawText: true }).rawText).toBe(text);
  });
});
