import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appBackendApi,
  type MarkOutcome,
  type MarkRow,
  type MarkVia,
} from '../lib/appBackendApi';
import { appBackendClient } from '../lib/appBackendClient';

export interface UseMarksResult {
  available: boolean;
  marks: MarkRow[];
  mark: (args: {
    receiptId: string;
    lineNo: number;
    unitIndex: number;
    outcome: MarkOutcome;
    finishedAt: number;
    finishedAtHandSet: boolean;
    startedAt?: number;
    via: MarkVia;
  }) => Promise<void>;
  markMany: (args: {
    units: Array<{
      receiptId: string;
      lineNo: number;
      unitIndex: number;
    }>;
    outcome: MarkOutcome;
    finishedAt: number;
    finishedAtHandSet: boolean;
    via: MarkVia;
  }) => Promise<void>;
  unmark: (args: {
    receiptId: string;
    lineNo: number;
    unitIndex: number;
  }) => Promise<void>;
  error: string | null;
}

export function useMarks(token: string | null): UseMarksResult {
  const client = appBackendClient();
  const [marks, setMarks] = useState<MarkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!client || !token) {
      setMarks([]);
      return;
    }

    try {
      const query = client.watchQuery(appBackendApi.marks.list, {
        token,
      });

      const unsubscribe = query.onUpdate(() => {
        const result = query.localQueryResult();
        if (result !== undefined) {
          setMarks(result);
          setError(null);
        }
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        unsubscribe();
        unsubscribeRef.current = null;
      };
    } catch (err) {
      setError(String(err));
      return;
    }
  }, [client, token]);

  const mark = useCallback(
    async (args: any) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.mark, {
          token,
          ...args,
        });
        setError(null);
      } catch (err) {
        setError(String(err));
        throw err;
      }
    },
    [client, token],
  );

  const markMany = useCallback(
    async (args: any) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.markMany, {
          token,
          ...args,
        });
        setError(null);
      } catch (err) {
        setError(String(err));
        throw err;
      }
    },
    [client, token],
  );

  const unmark = useCallback(
    async (args: any) => {
      if (!client || !token) return;
      try {
        await client.mutation(appBackendApi.marks.unmark, {
          token,
          ...args,
        });
        setError(null);
      } catch (err) {
        setError(String(err));
        throw err;
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
