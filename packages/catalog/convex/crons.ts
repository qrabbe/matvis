import { cronJobs } from 'convex/server';
// import { internal } from './_generated/api';

/** Registered but empty. Uncomment the jobs below and the `internal` import to
 * turn scheduled ingest on. Times are UTC and staggered off the hour.
 *
 * The pair below is Coop's. Every lane needs its own pair, so turning ICA on
 * means adding two more jobs with their own names and their own times, not
 * editing the slug in these. Two lanes on one schedule would also fetch two
 * sources at once, which is the opposite of what a request budget is for. */
const crons = cronJobs();

// A whole run: sweep `eans` for what `catalog` has no row for, then fetch it.
// The sweep hands over to the fetch itself, so this one job is the pair.
//
// crons.cron(
//   'coop ingest run',
//   '15 3 * * *',
//   internal.ingest.queueMissingEans,
//   { store: 'coop' },
// );

// The queue's heartbeat, for rows already queued when no sweep is due. Also
// what retries every failure, since a failed row sits in `pending`.
//
// crons.interval(
//   'coop ingest queue',
//   { hours: 1 },
//   internal.ingest.fetchQueuedEans,
//   { store: 'coop' },
// );

export default crons;
