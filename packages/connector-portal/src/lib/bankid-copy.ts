export const pendingHint =
  'Open the BankID app on your phone and scan the code.';

export function failedHintMessage(error?: string): string {
  return error ?? 'BankID login failed. Please try again.';
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

export function bankIdAppLink(autoStartToken: string): string {
  const token = encodeURIComponent(autoStartToken);
  return isMobileBrowser()
    ? `https://app.bankid.com/?autostarttoken=${token}`
    : `bankid:///?autostarttoken=${token}`;
}

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
