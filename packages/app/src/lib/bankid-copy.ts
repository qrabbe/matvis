/**
 * UI copy for BankID progress
 */

const PENDING_MESSAGES: Record<string, string> = {
  outstandingTransaction: 'Start the BankID app on your phone.',
  noClient: 'Start the BankID app on your phone.',
  started:
    'Searching for BankID… make sure the app is installed and up to date.',
  userMtd: 'Follow the instructions in the BankID app.',
  userCallConfirm: 'Confirm the ongoing call in the BankID app.',
  userSign: 'Enter your security code in the BankID app.',
};

const FAILED_MESSAGES: Record<string, string> = {
  userCancel: 'You cancelled the login in the BankID app.',
  cancelled: 'The login was cancelled.',
  expiredTransaction: 'The login timed out. Please try again.',
  certificateErr: 'There is a problem with your BankID. Contact your bank.',
  startFailed:
    'Could not reach BankID. Check your connection and scan the code again.',
  userDeclinedCall: 'The call was declined in the BankID app.',
};

export function pendingHintMessage(hintCode?: string): string {
  return (
    (hintCode && PENDING_MESSAGES[hintCode]) ??
    'Open the BankID app on your phone and scan the code.'
  );
}

export function failedHintMessage(hintCode?: string, error?: string): string {
  return (
    (hintCode && FAILED_MESSAGES[hintCode]) ?? error ?? 'BankID login failed.'
  );
}

/**
 * Same-device deep link
 */
export function bankIdAppLink(autoStartToken: string): string {
  return `bankid:///?autostarttoken=${encodeURIComponent(autoStartToken)}&redirect=null`;
}
