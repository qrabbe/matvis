import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import type { StoreSlug } from '@matvis/shared';
import { api, type Id } from '../lib/convexApi';
import {
  bankIdAppLink,
  failedHintMessage,
  launchBankIdApp,
  pendingHint,
} from '../lib/bankid-copy';
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
 *
 * The caller's account is resolved server-side from the authenticated identity
 * (Convex Auth), so no `subject` is passed — the seam ignores it in prod.
 */
export function useBankIdLink(onComplete: (connectionId: string) => void) {
  const convex = useConvex();
  const [phase, setPhase] = useState<LinkPhase>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [appLink, setAppLink] = useState<string | null>(null);
  const [sameDevice, setSameDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  // Same-device launch bookkeeping, read inside the poll loop's stable closure.
  const sameDeviceRef = useRef(false);
  const launchedRef = useRef(false);

  useEffect(() => () => void (activeRef.current = false), []);

  /** Launch the BankID app once for a same-device flow (idempotent). */
  const launchOnce = useCallback((token: string) => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const link = bankIdAppLink(token);
    setAppLink(link);
    launchBankIdApp(link);
  }, []);

  const runPoll = useCallback(
    async (pendingLinkId: Id<'pendingLinks'>) => {
      activeRef.current = true;
      setPhase('polling');
      while (activeRef.current) {
        let res;
        try {
          res = await convex.action(api.links.poll, { pendingLinkId });
        } catch (e) {
          activeRef.current = false;
          setError(errMsg(e));
          setPhase('error');
          setQr(null);
          return;
        }
        if (!activeRef.current) return;

        if (res.status === 'pending') {
          // Same-device: the autostart token may arrive on the poll rather than
          // the start — launch the app the moment it does.
          if (sameDeviceRef.current && res.autoStartToken) {
            launchOnce(res.autoStartToken);
          }
          if (res.qrCode) setQr(res.qrCode);
          setHint(pendingHint);
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
    [convex, onComplete, launchOnce],
  );

  const login = useCallback(
    async (store: StoreSlug, onThisDevice = false) => {
      setError(null);
      setQr(null);
      setHint(pendingHint);
      setAppLink(null);
      setSameDevice(onThisDevice);
      sameDeviceRef.current = onThisDevice;
      launchedRef.current = false;
      setPhase('starting');
      activeRef.current = true; // so cancel() during the start await is honored
      try {
        const { pendingLinkId, autoStartToken } = await convex.action(
          api.links.start,
          { store, sameDevice: onThisDevice },
        );
        if (!activeRef.current) return; // cancelled while starting
        // Same-device: best-effort launch once the start carries the token. This
        // runs after an await, so it's outside the tap's gesture — iOS Safari may
        // block it; the "Tap to open BankID" fallback link is what reliably
        // launches there. If the token arrives on a poll instead, see `runPoll`.
        if (onThisDevice && autoStartToken) launchOnce(autoStartToken);
        await runPoll(pendingLinkId);
      } catch (e) {
        if (!activeRef.current) return; // cancelled — the abort isn't an error
        setError(errMsg(e));
        setPhase('error');
      }
    },
    [convex, runPoll, launchOnce],
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
    cancel();
    setError(null);
  }, [cancel]);

  const active = phase === 'starting' || phase === 'polling';
  return {
    phase,
    active,
    qr,
    hint,
    appLink,
    sameDevice,
    error,
    login,
    cancel,
    reset,
  };
}
