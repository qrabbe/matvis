import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema( {
	/**
	 * One pantry unit finished or thrown away, on a date. A unit is a single
	 * package (or weighed lot) from one receipt line — `receiptId` + `lineNo`
	 * + `unitIndex` is its whole identity, deliberately not the product's
	 * EAN, so a mark survives the line being re-matched to a different
	 * product later and a re-parse that only enriches quantity/unit (see
	 * `packages/connector`'s parser) never orphans it. `token` is the
	 * connector's own account token, reused verbatim as an opaque partition
	 * key; this deployment never verifies it against the connector, the same
	 * way `catalog` never verifies anything about its callers.
	 *
	 * Nothing here is precomputed: which unit is "oldest" and due next, a
	 * product's typical duration, and the forecast are all derived at read
	 * time in `src/lib` from these rows plus the connector's receipt lines —
	 * see `pantryUnits.ts` and `durations.ts`. This table is the only source
	 * of truth for what actually happened.
	 */
	marks: defineTable( {
		token: v.string(),
		receiptId: v.string(),
		lineNo: v.number(),
		unitIndex: v.number(),
		outcome: v.union( v.literal( 'finished' ), v.literal( 'wasted' ) ),
		finishedAt: v.number(), // epoch ms
		/**
		 * True when the person actively chose this date rather than accepting
		 * the prefilled default. A single tap always counts as teaching a
		 * product's typical duration; a bulk "Mark all" only does when this is
		 * true — otherwise catching up a forgotten trip would teach bread that
		 * it lasts however long it sat unmarked. See `durations.ts`.
		 */
		finishedAtHandSet: v.boolean(),
		/**
		 * Defaults to the unit's purchase date, or the previous unit of the
		 * same product's finish date, whichever a fresh mark would compute —
		 * stored only once the person opens the toast's "Started" chip and
		 * sets something else.
		 */
		startedAt: v.optional( v.number() ),
		via: v.union(
			v.literal( 'tap' ),
			v.literal( 'trip' ),
			v.literal( 'details' ),
			v.literal( 'backfill' )
		),
		/**
		 * Absent (equivalently `'user'`) for anything a person actually did.
		 * `'backfill'` is stamped only by the one-time script that plays
		 * pre-tracking history forward from an estimate — those dates are
		 * played-forward guesses, not observations, so they must never teach
		 * `durations.ts` anything regardless of `via`/`finishedAtHandSet`.
		 */
		source: v.optional(
			v.union( v.literal( 'user' ), v.literal( 'backfill' ) )
		),
	} )
		.index( 'by_token', [ 'token' ] )
		.index( 'by_token_unit', [
			'token',
			'receiptId',
			'lineNo',
			'unitIndex',
		] ),

	/**
	 * The backfill's per-product estimate, imported once from
	 * `tickets/backfill/durations.json` and otherwise read-only at runtime —
	 * `durations.ts`'s tier 2, used only when a product has fewer than two of
	 * the account's own teaching marks. Never written to by anything in the
	 * live app. Keyed the same way `pantryGroupKey` groups a tile
	 * (`product:<gtin>` or `produce:<normalizedText>`), not the backfill
	 * file's own `ean:`/`text:store:` key scheme, so every reader shares one
	 * key format.
	 */
	durationEstimates: defineTable( {
		groupKey: v.string(),
		label: v.string(),
		daysToFinish: v.number(),
		daysOnceOpened: v.optional( v.number() ),
		maxDaysFromPurchase: v.optional( v.number() ),
		singleUse: v.optional( v.boolean() ),
		source: v.string(),
	} ).index( 'by_group_key', [ 'groupKey' ] ),

	/**
	 * A row exists only once an account changes a target away from its
	 * code-level default — nothing is ever written here just to record "the
	 * default", which would only go stale the day the default changes. Per
	 * target: absent (the key missing from `targets`) means "on, at the
	 * default"; a number means "on, at this value"; `null` means "off". The
	 * defaults themselves live in `src/lib/targets.ts`, not here.
	 */
	settings: defineTable( {
		token: v.string(),
		targets: v.object( {
			energy: v.optional( v.union( v.null(), v.number() ) ),
			protein: v.optional( v.union( v.null(), v.number() ) ),
			fat: v.optional( v.union( v.null(), v.number() ) ),
			carbs: v.optional( v.union( v.null(), v.number() ) ),
			fiber: v.optional( v.union( v.null(), v.number() ) ),
			saturatedFat: v.optional( v.union( v.null(), v.number() ) ),
			salt: v.optional( v.union( v.null(), v.number() ) ),
		} ),
	} ).index( 'by_token', [ 'token' ] ),
} );
