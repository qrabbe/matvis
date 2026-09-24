import { useCallback, useEffect, useRef, useState } from 'react';
import { appBackendApi, type PreferenceRow } from '../lib/appBackendApi';
import { appBackendClient } from '../lib/appBackendClient';
import type { ConsumptionEvent } from '../lib/consumption';
import { errMsg } from '@matvis/shared';

export interface ConsumptionEventEntry extends ConsumptionEvent {
  id: string;
}

export interface Consumption {
  available: boolean;
  events: ConsumptionEventEntry[];
  excludedEans: Set<string>;
  logConsumption: (
    ean: string,
    quantity: number,
    consumedAt: number,
  ) => Promise<void>;
  deleteConsumption: (eventId: string) => Promise<void>;
  setExcluded: (ean: string, excluded: boolean) => Promise<void>;
  error: string | null;
}

/** Reactive subscriptions to app's own backend, a second Convex deployment
 * alongside the connector's — so this uses the client's own `watchQuery`
 * rather than the `useQuery` hook, which only reads from the nearest
 * `<ConvexProvider>` (already wired to the connector). */
export function useConsumption(token: string | null): Consumption {
  const client = appBackendClient();
  const [events, setEvents] = useState<ConsumptionEventEntry[]>([]);
  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (!client || !token) {
      // A new [] every render would change identity even when there was
      // nothing to clear, forcing a pointless extra render of every
      // consumer — bail out by reference when already empty.
      setEvents((prev) => (prev.length === 0 ? prev : []));
      setPreferences((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const eventsWatch = client.watchQuery(
      appBackendApi.consumption.listConsumption,
      {
        token,
      },
    );
    const preferencesWatch = client.watchQuery(
      appBackendApi.consumption.listPreferences,
      { token },
    );

    const applyEvents = () => {
      const rows = eventsWatch.localQueryResult();
      if (rows) {
        setEvents(
          rows.map((row) => ({
            id: row._id,
            ean: row.ean,
            quantity: row.quantity,
            consumedAt: row.consumedAt,
          })),
        );
      }
    };
    const applyPreferences = () => {
      const rows = preferencesWatch.localQueryResult();
      if (rows) setPreferences(rows);
    };

    applyEvents();
    applyPreferences();
    const unsubscribeEvents = eventsWatch.onUpdate(applyEvents);
    const unsubscribePreferences = preferencesWatch.onUpdate(applyPreferences);
    return () => {
      unsubscribeEvents();
      unsubscribePreferences();
    };
  }, [client, token]);

  const logConsumption = useCallback(
    async (ean: string, quantity: number, consumedAt: number) => {
      if (!clientRef.current || !token) return;
      try {
        await clientRef.current.mutation(
          appBackendApi.consumption.logConsumption,
          {
            token,
            ean,
            quantity,
            consumedAt,
          },
        );
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [token],
  );

  const deleteConsumption = useCallback(
    async (eventId: string) => {
      if (!clientRef.current || !token) return;
      try {
        await clientRef.current.mutation(
          appBackendApi.consumption.deleteConsumption,
          {
            token,
            eventId,
          },
        );
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [token],
  );

  const setExcluded = useCallback(
    async (ean: string, excluded: boolean) => {
      if (!clientRef.current || !token) return;
      try {
        await clientRef.current.mutation(
          appBackendApi.consumption.setExcluded,
          {
            token,
            ean,
            excluded,
          },
        );
        setError(null);
      } catch (e) {
        setError(errMsg(e));
        throw e;
      }
    },
    [token],
  );

  const excludedEans = new Set(
    preferences.filter((p) => p.excluded).map((p) => p.ean),
  );

  return {
    available: client !== null,
    events,
    excludedEans,
    logConsumption,
    deleteConsumption,
    setExcluded,
    error,
  };
}
