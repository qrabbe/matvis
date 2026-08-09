import type { QueryCtx } from '../_generated/server';
import {
  FRESHNESS_SAMPLE,
  MONTH_MS,
  WEEK_MS,
  type Coverage,
  type Freshness,
} from './ingest';
import {
  coverageKey,
  readCounter,
  CATALOG_COUNT_KEY,
  CATALOG_VERIFIED_KEY,
  COVERAGE_FIELDS,
  COVERAGE_MEASURED_AT_KEY,
} from './counters';

/** How much of the catalog has ever been verified against the source, and how
 * old the verified rows are.
 *
 * Two different kinds of number, deliberately. `verified` and `never` come from
 * maintained counters and are exact for the whole table. The buckets come from
 * a bounded sample of the most recently added rows, because bucketing the whole
 * table by age is a scan and an age bucket cannot be maintained on write. The
 * sample is biased toward new rows and the console says so; a number without
 * its window is a number that gets misremembered as all-time. */
export async function readFreshness(ctx: QueryCtx): Promise<Freshness> {
  const now = Date.now();
  const total = await readCounter(ctx, CATALOG_COUNT_KEY);
  const verified = await readCounter(ctx, CATALOG_VERIFIED_KEY);

  const sample = await ctx.db
    .query('catalog')
    .order('desc')
    .take(FRESHNESS_SAMPLE);

  const buckets = { week: 0, month: 0, older: 0, never: 0 };
  for (const row of sample) {
    if (row.fetchedAt === undefined) buckets.never += 1;
    else if (row.fetchedAt > now - WEEK_MS) buckets.week += 1;
    else if (row.fetchedAt > now - MONTH_MS) buckets.month += 1;
    else buckets.older += 1;
  }

  return {
    verified,
    never: Math.max(total - verified, 0),
    sample: { size: sample.length, ...buckets },
  };
}

/** What share of rows carry each optional field, as of the last recount.
 *
 * Recount-on-demand rather than maintained on write. Maintaining nine more
 * counters on every upsert is real write cost on the hot path, and a recount is
 * just as honest as long as its timestamp is on screen next to it - which is
 * why `measuredAt` is in the return shape rather than being decoration.
 * `measuredAt` is null before the first recount, and the console says so
 * instead of drawing nine zeroes as if they were measurements. */
export async function readCoverage(ctx: QueryCtx): Promise<Coverage> {
  const measuredAt = await readCounter(ctx, COVERAGE_MEASURED_AT_KEY);
  const fields = await Promise.all(
    COVERAGE_FIELDS.map(async (field) => ({
      field,
      count: await readCounter(ctx, coverageKey(field)),
    })),
  );
  return {
    measuredAt: measuredAt > 0 ? measuredAt : null,
    total: await readCounter(ctx, CATALOG_COUNT_KEY),
    fields,
  };
}
