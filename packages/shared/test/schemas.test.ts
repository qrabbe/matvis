import { describe, expect, it } from 'bun:test';
import {
  BankIdPoll,
  LineItem,
  Receipt,
  ReceiptListResponse,
  TokenSet,
} from '../src/index';

describe('schema defaults', () => {
  it('TokenSet fills expiry/obtained defaults', () => {
    const set = TokenSet.parse({ accessToken: 'a', refreshToken: 'r' });
    expect(set.expiresAt).toBe(0);
    expect(set.obtainedAt).toBe(0);
  });

  it('LineItem defaults isDiscount to false', () => {
    expect(LineItem.parse({ text: 'x', price: 1 }).isDiscount).toBe(false);
  });

  it('Receipt fills schemaVersion, currency, and vat defaults', () => {
    const r = Receipt.parse({
      source: 'coop',
      store: { name: 's' },
      items: [],
    });
    expect(r.schemaVersion).toBe(1);
    expect(r.currency).toBe('SEK');
    expect(r.vat).toEqual([]);
  });

  it('ReceiptListResponse defaults data to []', () => {
    expect(ReceiptListResponse.parse({}).data).toEqual([]);
  });
});

describe('BankIdPoll discriminated union', () => {
  it('parses each status variant', () => {
    expect(BankIdPoll.parse({ status: 'pending', qrCode: 'q' }).status).toBe(
      'pending',
    );
    expect(
      BankIdPoll.parse({ status: 'failed', error: 'e', hintCode: 'userCancel' })
        .status,
    ).toBe('failed');
    const complete = BankIdPoll.parse({
      status: 'complete',
      tokens: { accessToken: 'a', refreshToken: 'r' },
    });
    expect(complete.status).toBe('complete');
  });

  it('rejects an unknown status', () => {
    expect(BankIdPoll.safeParse({ status: 'weird' }).success).toBe(false);
  });
});
