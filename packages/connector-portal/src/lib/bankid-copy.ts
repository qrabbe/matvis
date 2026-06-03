// UI copy for BankID progress. `links.poll` returns a coarse status without
// BankID hintCodes, so the copy is generic (no per-hint variants).

export const pendingHint =
  'Open the BankID app on your phone and scan the code.';

export function failedHintMessage(error?: string): string {
  return error ?? 'BankID login failed. Please try again.';
}

/** Same-device deep link into the BankID app. */
export function bankIdAppLink(autoStartToken: string): string {
  return `bankid:///?autostarttoken=${encodeURIComponent(autoStartToken)}&redirect=null`;
}
