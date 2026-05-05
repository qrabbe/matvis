import { describe, expect, it } from 'bun:test';
import {
  bankIdAppLink,
  failedHintMessage,
  pendingHintMessage,
} from '../../src/lib/bankid-copy';

describe('pendingHintMessage', () => {
  it('maps a known hint to guidance', () => {
    expect(pendingHintMessage('userSign')).toBe(
      'Enter your security code in the BankID app.',
    );
  });
  it('falls back for unknown or absent hints', () => {
    const fallback = 'Open the BankID app on your phone and scan the code.';
    expect(pendingHintMessage('somethingNew')).toBe(fallback);
    expect(pendingHintMessage()).toBe(fallback);
  });
});

describe('failedHintMessage', () => {
  it('maps a known hint to an explanation', () => {
    expect(failedHintMessage('userCancel')).toBe(
      'You cancelled the login in the BankID app.',
    );
  });
  it('falls back to the raw error, then to a generic message', () => {
    expect(failedHintMessage('unknownCode', 'raw error')).toBe('raw error');
    expect(failedHintMessage()).toBe('BankID login failed.');
  });
});

describe('bankIdAppLink', () => {
  it('builds an encoded same-device deep link', () => {
    const link = bankIdAppLink('tok en+/');
    expect(link).toBe('bankid:///?autostarttoken=tok%20en%2B%2F&redirect=null');
  });
});
