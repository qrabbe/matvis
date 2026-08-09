# Migrating the catalog to canonical units

`packageSize` + `packageSizeUnit` + `salesUnit` became `netContent` + `soldBy`.
The code is landed; **the data has not been migrated.** This is the runbook for
doing that, and it needs no Coop traffic.

## Why this is cheap

`packageSizeUnit` was stored verbatim on the clean row, so resolving it to a
canonical unit is a pure function of data already in the table. A projector
change normally means re-projecting from a stored source payload, and those are
not kept — refilling would mean re-fetching every row through Coop's rate limit.
This one does not. `backfill.normalizeUnits` reads the legacy fields off each
clean row and rewrites it in place.

## Why it is not a single push

Convex validates every stored document against the new schema **at push time**.
Every existing catalog row carries three fields the new schema does not declare,
so the push that would let you run the migration is itself rejected. The schema
check is the blocker here, not the safety net.

There is also a read window to choose rather than discover. The public queries
declare `returns: v.array(catalogDocValidator)` and Convex enforces return
validators per call, so between the schema landing and the migration finishing,
a read touching an unmigrated row **throws** rather than degrading. That is the
catalog portal and the app's product lookups both failing. The window is short,
but it is real.

## The sequence

1. **Pause ingest** — the console's switch, or `admin.setPaused`. A worker
   writing a clean row mid-migration is one more thing to reason about for no
   benefit.

2. **Take a snapshot.** `bunx convex export --path catalog-pre-units.zip`. The
   migration is idempotent and re-runnable, but this is the step that rewrites
   every row in the table, so have the before state on disk.

3. **Deploy with schema validation off.** In `convex/schema.ts`:

   ```ts
   export default defineSchema({ ...tables }, { schemaValidation: false });
   ```

   The push is accepted with the old rows still in place.

4. **Run the migration.**

   ```
   bunx convex run backfill:normalizeUnits
   ```

   It pages the whole table at 500 rows a transaction and reports
   `{ scanned, rewritten, unresolved, pages }`. **Check `unresolved`.** It counts
   rows that stated a size whose unit did not resolve, which is the only signal
   that `UNIT_BY_SOURCE` has a gap.

   **A non-zero `unresolved` cannot be fixed by re-running.** The rewrite drops
   the three legacy fields whether or not the unit resolved, and the re-run
   guard is "does this row still carry legacy fields", so an unresolved row is
   skipped on the second pass with its source spelling already gone. That is a
   deliberate trade and not a bug: keeping the evidence would mean keeping
   undeclared fields, which is precisely what step 5 has to reject. The cost is
   that the pre-migration snapshot from step 2 is the only copy of those
   spellings.

   The repair is `backfill:repairNetContent`. Add the missing spellings to
   `UNIT_BY_SOURCE` in `convex/model/project.ts`, deploy, then replay the
   affected rows out of the snapshot through it. It re-resolves through the same
   lookup a fetch would use and only ever fills a gap, so replaying more rows
   than strictly necessary is safe.

   Run on prod 2026-08-09 over 34 204 rows: 105 unresolved. 44 were real gaps
   (`kg`, `dl`, `gram/bit ungefärlig vikt`, `meter`, all now in the lookup) and
   61 were rows with no unit to resolve at all, 60 of them loose produce
   carrying `packageSize: 1` and no `packageSizeUnit`.

5. **Turn schema validation back on** and deploy again. This push validates
   every row against the new schema, which is the real verification that step 4
   was complete — a better check than any spot query.

6. **Unpause ingest.**

**Rollback** is the snapshot from step 2, or a re-run after fixing the lookup
table. The migration only ever moves a row forward: a row already carrying
`netContent` is left alone.

## What it does not touch

`fetchedAt` is carried forward unchanged. Rewriting a row is not verifying it
against the source, and stamping it here would claim a freshness the row never
earned. Every migrated row keeps whatever freshness it had, including none.
