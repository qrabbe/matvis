import { cronJobs } from 'convex/server';
// import { internal } from './_generated/api';

/** Registered but empty. Uncomment the jobs below and the `internal` import to
 * turn scheduled ingest on. Times are UTC and staggered off the hour. */
const crons = cronJobs();

// Freshness.
//
// crons.cron(
//   'coop refresh sweep',
//   '15 3 * * *',
//   internal.ingest.refreshOldest,
//   {},
// );

// Growth.
//
// crons.cron(
//   'coop discovery',
//   '15 4 * * 1',
//   internal.coop.discovery.discoverFromSitemap,
//   {},
// );

// The queue's heartbeat, for rows discovery did not drain itself.
//
// crons.interval(
//   'coop ingest queue',
//   { hours: 1 },
//   internal.ingest.processQueue,
//   {},
// );

export default crons;
