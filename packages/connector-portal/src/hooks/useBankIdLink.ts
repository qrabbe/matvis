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
import { errMsg } from '@matvis/shared';

export type LinkPhase = 'idle' | 'starting' | 'polling' | 'error';

const POLL_INTERVAL_MS = 2000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useBankIdLink(onComplete: (connectionId: string) => void) {
  const convex = useConvex();
  const [phase, setPhase] = useState<LinkPhase>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [appLink, setAppLink] = useState<string | null>(null);
  const [sameDevice, setSameDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const sameDeviceRef = useRef(false);
  const launchedRef = useRef(false);

  useEffect(() => () => void (activeRef.current = false), []);

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
        if (!activeRef.current) return;
        if (onThisDevice && autoStartToken) launchOnce(autoStartToken);
        await runPoll(pendingLinkId);
      } catch (e) {
        if (!activeRef.current) return;
        setError(errMsg(e));
        setPhase('error');
      }
    },
    [convex, runPoll, launchOnce],
  );

  const cancel = useCallback(() => {
    activeRef.current = false;
    setPhase('idle');
    setQr(null);
    setHint(null);
    setAppLink(null);
  }, []);

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
