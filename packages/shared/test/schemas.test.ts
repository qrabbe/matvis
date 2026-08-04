import { describe, expect, it } from 'bun:test';
import {
  BankIdPoll,
  isAccessTokenValid,
  LineItem,
  Receipt,
  ReceiptCore,
  ReceiptSource,
  ReceiptSummary,
  TokenSet,
} from '../src/index';

const NOW = 1_700_000_000_000;

describe('schema defaults', () => {
  it('TokenSet fills expiry/obtained defaults', () => {
    const set = TokenSet.parse({ accessToken: 'a', refreshToken: 'r' });
    expect(set.expiresAt).toBe(0);
    expect(set.obtainedAt).toBe(0);
  });

  it('LineItem defaults isDiscount to false', () => {
    expect(LineItem.parse({ text: 'x', price: 1 }).isDiscount).toBe(false);
  });

  it('Receipt fills currency and vat defaults', () => {
    const r = Receipt.parse({
      source: 'coop',
      store: { name: 's' },
      items: [],
    });
    expect(r.currency).toBe('SEK');
    expect(r.vat).toEqual([]);
  });

  it('ReceiptCore keeps only what a header row stores', () => {
    const core = ReceiptCore.parse({
      source: 'coop',
      store: { name: 's' },
      items: [{ text: 'x', price: 1 }],
      cashier: '9',
      receiptType: 'Elektroniskt kassakvitto',
      rawText: 'raw',
    });
    expect(Object.keys(core).sort()).toEqual([
      'currency',
      'source',
      'store',
      'vat',
    ]);
  });

  it('ReceiptSummary needs only an id', () => {
    const s = ReceiptSummary.parse({ id: 'r1' });
    expect(s).toEqual({ id: 'r1' });
    expect(ReceiptSummary.safeParse({ id: 'r1', amount: null }).success).toBe(
      false,
    );
  });
});

describe('isAccessTokenValid', () => {
  it('treats 0 expiry as always valid', () => {
    expect(isAccessTokenValid({ expiresAt: 0 }, NOW)).toBe(true);
  });

  it('is valid before expiry and invalid after', () => {
    expect(isAccessTokenValid({ expiresAt: NOW + 1000 }, NOW)).toBe(true);
    expect(isAccessTokenValid({ expiresAt: NOW - 1000 }, NOW)).toBe(false);
  });
});

describe('ReceiptSource store slugs', () => {
  it('accepts a known slug and rejects an unknown one', () => {
    expect(ReceiptSource.safeParse('coop').success).toBe(true);
    expect(ReceiptSource.safeParse('notastore').success).toBe(false);
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
