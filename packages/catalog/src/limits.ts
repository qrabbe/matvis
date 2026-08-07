/** Operator-facing bounds the console has to state out loud. They live here,
 * outside `convex/`, because both the backend that enforces them and the panel
 * that describes them need the same number. A panel quoting its own copy of one
 * is how the descriptions drifted from the code in the first place.
 *
 * Nothing is imported here on purpose, so the portal bundle pays only for the
 * numbers. */

/** Ceiling on one paste into the enqueue panel. Above it the action throws
 * rather than truncating, so the operator is never told less was queued than
 * they pasted. */
export const ENQUEUE_PASTE_MAX = 20000;

/** Rows one press of requeue, clear-done or remove touches. Each reports what
 * it did, so a full queue takes more than one press. */
export const QUEUE_MAINTENANCE_LIMIT = 1000;
