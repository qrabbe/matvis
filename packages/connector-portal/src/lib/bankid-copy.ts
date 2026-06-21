// UI copy for BankID progress. `links.poll` returns a coarse status without
// BankID hintCodes, so the copy is generic (no per-hint variants).

export const pendingHint =
  'Open the BankID app on your phone and scan the code.';

export function failedHintMessage(error?: string): string {
  return error ?? 'BankID login failed. Please try again.';
}

/** Rough mobile-browser check — selects the same-device launch URL form below. */
function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ defaults to a desktop "Macintosh" UA, so the `ipad` token is
  // absent; a Mac reporting multi-touch is really an iPad.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

/**
 * Same-device BankID launch URL for an `autoStartToken`. Per BankID's autostart
 * spec the form is platform-specific: mobile browsers must use the universal /
 * app link (`https://app.bankid.com/…`), while desktop uses the `bankid://`
 * custom scheme. (`redirect` is deprecated — omitted; we learn the result by
 * polling, not by the app relaunching the browser.)
 */
export function bankIdAppLink(autoStartToken: string): string {
  const token = encodeURIComponent(autoStartToken);
  return isMobileBrowser()
    ? `https://app.bankid.com/?autostarttoken=${token}`
    : `bankid:///?autostarttoken=${token}`;
}

/**
 * Launch the BankID app for a same-device login. BankID's docs prescribe a
 * programmatic `<a>` click with `referrerPolicy="origin"` (not
 * `window.location`), which is what resolves the universal/app link to the app.
 */
export function launchBankIdApp(url: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.referrerPolicy = 'origin';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
