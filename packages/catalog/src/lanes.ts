/** Which stores the ingest pipeline actually has a fetch lane for. `STORES` in
 * `@matvis/shared` lists every chain a receipt can name, which is ten; only
 * these have code behind them. The console offers this list rather than that
 * one, because offering a store with no lane buys an operator a run that throws
 * `no ingest lane for willys`.
 *
 * `convex/ingest.ts` keys its lane table off `IngestLane`, so adding a slug here
 * without writing the lane fails typecheck. That is the point: this is the one
 * list, and it cannot drift from the code.
 *
 * Imported by the portal, so nothing but types is imported here. */
import type { StoreSlug } from '@matvis/shared';

export const INGEST_LANES = [
  'coop',
  'ica',
] as const satisfies readonly StoreSlug[];

export type IngestLane = (typeof INGEST_LANES)[number];

export function isIngestLane(store: string): store is IngestLane {
  return (INGEST_LANES as readonly string[]).includes(store);
}
