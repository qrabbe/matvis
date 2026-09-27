import { useCallback, useEffect, useMemo, useState } from 'react';
import { appBackendApi, type TargetsValue } from '../lib/appBackendApi';
import { appBackendClient } from '../lib/appBackendClient';
import {
  resolveTarget,
  TARGET_DEFINITIONS,
  type TargetDefinition,
  type TargetKey,
} from '../lib/targets';
import { errMsg } from '@matvis/shared';

export interface ResolvedTarget extends TargetDefinition {
  key: TargetKey;
  enabled: boolean;
  value: number;
}

export interface UseSettingsResult {
  available: boolean;
  targets: ResolvedTarget[];
  /** `null` turns the target off; `undefined` turns it back on at the
   * default; a number turns it on at that custom value. */
  setTarget: (key: TargetKey, next: number | null | undefined) => Promise<void>;
  error: string | null;
}

/** Mirrors `useMarks`'s shape — app's own backend, so a `watchQuery`
 * against its own client rather than the ambient connector one. */
export function useSettings(token: string | null): UseSettingsResult {
  const client = appBackendClient();
  const [stored, setStored] = useState<TargetsValue>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !token) {
      setStored((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const watch = client.watchQuery(appBackendApi.settings.get, { token });
    // See useMarks.ts: a server-side query error re-throws from
    // `localQueryResult()` rather than resolving to undefined.
    const apply = () => {
      try {
        const result = watch.localQueryResult();
        if (result !== undefined) setStored(result.targets);
      } catch (e) {
        setError(errMsg(e));
      }
    };
    apply();
    return watch.onUpdate(apply);
  }, [client, token]);

  const setTarget = useCallback(
    async (key: TargetKey, next: number | null | undefined) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.settings.setTargets, {
          token,
          targets: { [key]: next },
        });
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [client, token],
  );

  const targets = useMemo(
    () =>
      (Object.keys(TARGET_DEFINITIONS) as TargetKey[]).map((key) => ({
        key,
        ...TARGET_DEFINITIONS[key],
        ...resolveTarget(key, stored),
      })),
    [stored],
  );

  return useMemo(
    () => ({ available: client !== null, targets, setTarget, error }),
    [client, targets, setTarget, error],
  );
}
