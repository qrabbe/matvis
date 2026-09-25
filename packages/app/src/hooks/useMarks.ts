import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  appBackendApi,
  type MarkOutcome,
  type MarkRow,
  type MarkSource,
  type MarkVia,
  type UnitKey,
} from '../lib/appBackendApi';
import { appBackendClient } from '../lib/appBackendClient';
import { errMsg } from '@matvis/shared';

export interface MarkArgs extends UnitKey {
  outcome: MarkOutcome;
  finishedAt: number;
  finishedAtHandSet: boolean;
  startedAt?: number;
  via: MarkVia;
  source?: MarkSource;
}

export interface MarkManyArgs {
  units: UnitKey[];
  outcome: MarkOutcome;
  finishedAt: number;
  finishedAtHandSet: boolean;
  via: MarkVia;
  source?: MarkSource;
}

export interface UseMarksResult {
  available: boolean;
  marks: MarkRow[];
  mark: (args: MarkArgs) => Promise<void>;
  markMany: (args: MarkManyArgs) => Promise<void>;
  unmark: (args: UnitKey) => Promise<void>;
  error: string | null;
}

/** Reactive subscription to app's own backend, a second Convex deployment
 * alongside the connector's — so this uses the client's own `watchQuery`
 * rather than the `useQuery` hook, which only reads from the nearest
 * `<ConvexProvider>` (already wired to the connector). Mirrors the deleted
 * `useConsumption` hook's shape. */
export function useMarks(token: string | null): UseMarksResult {
  const client = appBackendClient();
  const [marks, setMarks] = useState<MarkRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !token) {
      setMarks((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const watch = client.watchQuery(appBackendApi.marks.list, { token });
    const apply = () => {
      const result = watch.localQueryResult();
      if (result !== undefined) setMarks(result);
    };
    apply(); // a cached result is already there the moment the watch is created
    const unsubscribe = watch.onUpdate(apply);
    return unsubscribe;
  }, [client, token]);

  const mark = useCallback(
    async (args: MarkArgs) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.mark, { token, ...args });
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [client, token],
  );

  const markMany = useCallback(
    async (args: MarkManyArgs) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.markMany, {
          token,
          ...args,
        });
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [client, token],
  );

  const unmark = useCallback(
    async (args: UnitKey) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.unmark, { token, ...args });
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [client, token],
  );

  const available = client !== null;

  return useMemo(
    () => ({ available, marks, mark, markMany, unmark, error }),
    [available, marks, mark, markMany, unmark, error],
  );
}
