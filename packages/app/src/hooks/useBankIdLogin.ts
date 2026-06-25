import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenSet } from '@matvis/shared';
import { connector } from '../lib/connector';
import {
  bankIdAppLink,
  failedHintMessage,
  pendingHintMessage,
} from '../lib/bankid-copy';
import { errMsg } from '../lib/format';

export type LoginPhase = 'idle' | 'starting' | 'polling' | 'error';

const POLL_INTERVAL_MS = 2000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Drives a BankID login: start → poll loop (rendering the animated QR + hint)
 * The `activeRef` guard stops an in-flight loop on cancel/clear/unmount.
 */
export function useBankIdLogin(onComplete: (tokens: TokenSet) => void) {
  const [phase, setPhase] = useState<LoginPhase>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [appLink, setAppLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  useEffect(() => () => void (activeRef.current = false), []);

  const runPoll = useCallback(
    async (orderRef: string) => {
      activeRef.current = true;
      setPhase('polling');
      while (activeRef.current) {
        let res;
        try {
          res = await connector.pollAuth(orderRef);
        } catch (e) {
          activeRef.current = false;
          setError(errMsg(e));
          setPhase('error');
          setQr(null);
          return;
        }
        if (!activeRef.current) return;

        if (res.status === 'pending') {
          if (res.qrCode) setQr(res.qrCode);
          setHint(pendingHintMessage(res.hintCode));
          await delay(POLL_INTERVAL_MS);
          continue;
        }
        activeRef.current = false;
        setQr(null);
        setHint(null);
        if (res.status === 'complete') {
          onComplete(res.tokens);
          setPhase('idle');
        } else {
          setError(failedHintMessage(res.hintCode, res.error));
          setPhase('error');
        }
      }
    },
    [onComplete],
  );

  const login = useCallback(async () => {
    setError(null);
    setQr(null);
    setHint(pendingHintMessage());
    setAppLink(null);
    setPhase('starting');
    activeRef.current = true; // so cancel() during the start await is honored
    try {
      const { orderRef, autoStartToken } = await connector.startAuth();
      if (!activeRef.current) return; // cancelled while starting
      if (autoStartToken) setAppLink(bankIdAppLink(autoStartToken));
      await runPoll(orderRef);
    } catch (e) {
      if (!activeRef.current) return; // cancelled — the abort isn't an error
      setError(errMsg(e));
      setPhase('error');
    }
  }, [runPoll]);

  /** Stop the loop but keep any error visible (Cancel button) */
  const cancel = useCallback(() => {
    activeRef.current = false;
    setPhase('idle');
    setQr(null);
    setHint(null);
    setAppLink(null);
  }, []);

  /** Stop the loop and wipe all state, including errors (used on Clear tokens) */
  const reset = useCallback(() => {
    cancel();
    setError(null);
  }, [cancel]);

  const active = phase === 'starting' || phase === 'polling';
  return { phase, active, qr, hint, appLink, error, login, cancel, reset };
}
