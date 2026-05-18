/**
 * UI copy for BankID progress.
 *
 * The connector's server-side `links.poll` returns a coarse status
 * (`pending` | `complete` | `failed`) without BankID `hintCode`s, so these
 * are generic (no per-hint variants). Kept as helpers so real hint routing
 * is a drop-in later, and to keep `bankIdAppLink` in one place.
 */

export function pendingHintMessage(): string {
  return 'Open the BankID app on your phone and scan the code.';
}

export function failedHintMessage(error?: string): string {
  return error ?? 'BankID login failed. Please try again.';
}

/**
 * Same-device deep link into the BankID app.
 */
export function bankIdAppLink(autoStartToken: string): string {
  return `bankid:///?autostarttoken=${encodeURIComponent(autoStartToken)}&redirect=null`;
}
