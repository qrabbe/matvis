import { cronJobs } from 'convex/server';
// import { internal } from './_generated/api';

/**
 * Scheduled ingest. Registered but EMPTY for now — ingest runs on demand via
 * `bunx convex run` or from the admin console until the pipeline has been
 * watched for a while against the live Coop API. Uncomment the three jobs below
 * (and the `internal` import) to turn it on.
 *
 * Two things a schedule needs in order to be safe now exist, which is what makes
 * turning these on a decision rather than a leap: the console's pause switch,
 * checked at the top of every worker batch, and the `ingest_runs` log, which is
 * where a fire-and-forget run says what it did. A schedule that cannot be
 * stopped from a browser is one that should not be turned on.
 *
 * Everything here calls an internal function; there is no public ingest surface
 * on this deployment (see `ingest.ts`). Each job spends a bounded budget and
 * schedules its own continuation, because actions have a wall-clock limit and
 * the alternative — one job that loops until the catalog is done — would time
 * out halfway through and leave no record of where it got to.
 *
 * Times are UTC and deliberately staggered off the hour, so a Coop-side rate
 * limit is not something the whole schedule walks into at once.
 */
const crons = cronJobs();

// Freshness. Re-fetches the stalest ~2k rows a day, which turns the catalog over
// about once a week. A full re-scrape on a schedule would be wasteful and far
// likelier to get rate-limited.
//
// crons.cron(
//   'coop refresh sweep',
//   '15 3 * * *',
//   internal.ingest.refreshOldest,
//   {},
// );

// Growth. Reads the product sitemap and queues what the catalog does not hold
// yet, then drains what it queued. Weekly: Coop's sitemap is regenerated
// daily but the set of products in it barely moves, and a run that finds nothing
// new still costs a 3 MB download.
//
// crons.cron(
//   'coop discovery',
//   '15 4 * * 1',
//   internal.coop.discovery.discoverFromSitemap,
//   {},
// );

// The queue's own heartbeat. Discovery drains what it enqueues, so this exists
// for everything else that lands in the queue between runs — name rows in
// particular, which is how a caller holding only a receipt line gets a product
// into the catalog. A no-op when the queue is empty.
//
// crons.interval(
//   'coop ingest queue',
//   { hours: 1 },
//   internal.ingest.processQueue,
//   {},
// );

export default crons;
