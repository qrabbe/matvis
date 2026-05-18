import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import type { StoreSlug } from '@matvis/shared';
import { api, type Id } from '../lib/convexApi';
import { bankIdAppLink, failedHintMessage, pendingHintMessage } from '../lib/bankid-copy';
import { errMsg } from '../lib/format';

export type LinkPhase = 'idle' | 'starting' | 'polling' | 'error';

const POLL_INTERVAL_MS = 2000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Drives a BankID store-link: `links.start` → poll loop on `links.poll`
 * (rendering the animated QR), resolving to a server-side `connectionId`.
 *
 * Rewired from @matvis/app's `useBankIdLogin`: the loop calls Convex actions via
 * `useConvex()` instead of a client-side connector, and "complete" yields a
 * `connectionId` (tokens live server-side now) rather than a `TokenSet`. The
 * `activeRef` guard stops an in-flight loop on cancel/unmount.
 */
export function useBankIdLink(
  subject: string,
  onComplete: (connectionId: string) => void,
) {
  const convex = useConvex();
  const [phase, setPhase] = useState<LinkPhase>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [appLink, setAppLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  useEffect(() => () => void (activeRef.current = false), []);

  const runPoll = useCallback(
    async (pendingLinkId: Id<'pendingLinks'>) => {
      activeRef.current = true;
      setPhase('polling');
      while (activeRef.current) {
        let res;
        try {
          res = await convex.action(api.links.poll, { pendingLinkId, subject });
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
          setHint(pendingHintMessage());
          await delay(POLL_INTERVAL_MS);
          continue;
        }
        activeRef.current = false;
        setQr(null);
        setHint(null);
        if (res.status === 'complete') {
          onComplete(res.connectionId);
          setPhase('idle');
        } else {
          setError(failedHintMessage(res.error));
          setPhase('error');
        }
      }
    },
    [convex, subject, onComplete],
  );

  const login = useCallback(
    async (store: StoreSlug) => {
      setError(null);
      setQr(null);
      setHint(pendingHintMessage());
      setAppLink(null);
      setPhase('starting');
      try {
        const { pendingLinkId, autoStartToken } = await convex.action(
          api.links.start,
          { subject, store },
        );
        if (autoStartToken) setAppLink(bankIdAppLink(autoStartToken));
        await runPoll(pendingLinkId);
      } catch (e) {
        setError(errMsg(e));
        setPhase('error');
      }
    },
    [convex, subject, runPoll],
  );

  /** Stop the loop but keep any error visible (Cancel button). */
  const cancel = useCallback(() => {
    activeRef.current = false;
    setPhase('idle');
    setQr(null);
    setHint(null);
    setAppLink(null);
  }, []);

  /** Stop the loop and wipe all state, including errors. */
  const reset = useCallback(() => {
    activeRef.current = false;
    setPhase('idle');
    setQr(null);
    setHint(null);
    setAppLink(null);
    setError(null);
  }, []);

  const active = phase === 'starting' || phase === 'polling';
  return { phase, active, qr, hint, appLink, error, login, cancel, reset };
}
