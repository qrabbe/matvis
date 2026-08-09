# Catalog decisions

Choices that are not visible in the code, because the code's answer is silence.

---

## The failure paths, and which of them are acceptable

Read off the code and pinned by `convex/failures.vitest.ts`. Every behaviour
below is deliberate as of this writing; the ones marked **blocker** are
deliberate _only while runs are started by hand_.

### A failed fetch does not fail the run

The most surprising one, and it was found by writing the test rather than by
reading. The `catch` in `fetchOneBatch` is **inside** the run body, so a batch
in which every row failed settles as `status: 'ok'` with a summary carrying
`failed: N`. A run in which nothing succeeded is not an errored run.

Anything watching for `status: 'error'` will therefore never see the most
common real failure. That is not a defect in the fetch — the run genuinely did
complete and record what happened — but it is a trap for whatever eventually
watches runs, and the distinction has to be built in from the start:

- `status: 'error'` — the run itself broke.
- `status: 'ok'` with `failed` climbing — the run worked, the source did not.
- `status: 'ok'` with `added: 0` and nothing claimed — there was no work.

### The queue holds only work and memos

**Decided.** There is no `done` status and no `failed` status. Three states:
`pending`, `processing`, `skipped`.

A row whose product reached the catalog is **deleted**. The catalog row is the
record that the fetch happened, and a second row saying so is a table that grows
until someone empties it by hand — which is exactly what the old **Clear done**
button was for.

A row whose fetch failed goes back to **`pending`**, keeping its error and its
bumped `attempts`. The next run claims it again. That is what retired the
**Requeue failed** button: a failure that needs a human to notice it before it
is retried is a failure that waits as long as the human does.

`skipped` is the one terminal state, and it is a memo rather than an outcome.
See below.

### One bad response fails the whole batch, and stops the chain

**Accepted.** The catch marks all up to `COOP_BATCH_SIZE` (500) claimed rows
failed with the same error text, and they all return to `pending`.

It looks harsh, and the alternative is worse. Coop throttles with `403` over a
rolling window, so the overwhelmingly common cause of a thrown fetch is a
statement about the _caller_, not about any row in the batch. Degrading to
per-row retry would answer one refused request with up to 500 more, against the
limit that just refused it. The correct response to a throttle is fewer
requests.

**Which is why a thrown batch also stops the chain.** `fetchOneBatch` does not
reschedule the remaining batches when the lane threw. Once failures return
themselves to `pending`, a chain that carried on would re-claim the same
barcodes and put the same request back to the API that just refused it. The
rows wait in the queue and the next run picks them up. A per-row failure — one
product's upsert threw while the request itself succeeded — does not stop the
chain.

### A missing product is skipped, and never retried

**Accepted today, needs revisiting with any refresh path.** An EAN Coop returns
nothing for is recorded `skipped` with `not stocked by Coop`, and nothing moves
it out of that state.

The memo is load-bearing, not incidental. `queueEanIfMissing` treats any
existing queue row as a duplicate, so the `skipped` row is what stops the fill
sweep re-queueing every unstocked barcode on every pass and the fetch
re-requesting all of them. Deleting skipped rows the way stored ones are
deleted would put the pipeline in a loop.

The census README says the assortment is live stock and an item out of stock
everywhere is invisible, so some of those absences are temporary. Right now
nothing re-fetches anything at all, which makes the question moot. The day a
refresh path exists, `skipped` needs a re-check policy, and it is the same
ambiguity delisting runs into below.

### `attempts` increments and nothing caps it

**Blocker for automation, and more so than before.** There is no dead-letter
state. A permanently failing EAN now requeues itself forever and `attempts`
just climbs.

The old behaviour parked it in `failed` and waited for a human to press
Requeue, so the human was the cap. That cap is gone by design: the whole point
of retry-on-next-run is that nobody has to notice. What is left is **Remove
rows**, which is deliberate rather than accidental and is the only way to take
a poison barcode out of the lane.

While runs are manual this holds, because a run only happens when someone
presses Run. Schedule anything and it becomes an uncapped retry loop pointed at
someone else's API. A cap, or a dead-letter status, is a precondition for
turning anything on.

### No retry or backoff of any kind

**Blocker for automation**, same reasoning. `coop/fetch.ts` has no retry, no
backoff and no request budget. The census README records 24 concurrent requests
being refused where 12 were not, so the working limit is known and is not
encoded anywhere. Under manual operation the operator is the backoff.

### A missing API key fails a run, not a push

**Accepted, and deliberate.** `coopApiKey()` is read lazily inside the handler
because Convex imports every module at push time with no deployment env vars, so
a top-level throw would fail the deploy of the whole deployment rather than the
one function that needs the key.

### A dead worker's claim comes back after 30 minutes

**Accepted.** `claimPendingEans` resets `processing` rows older than `STALE_CLAIM_MS`
back to `pending`. Already covered by a test before this pass.

### What is not covered here

Reproducing a real `403` and a real shape change **against the live API** is
deliberately not done. A test that calls Coop is a test that consumes the rate
limit that causes the failure it is testing. Both are simulated at the response
boundary instead, which pins how this code reacts; it does not prove what Coop
sends. Confirming that is the remaining half of this work and needs a live run.

---

## Delisting: the catalog does not forget products

**Decided: ignore delisting. Nothing is deleted and nothing is flagged.**

A product Coop stops selling keeps its catalog row forever. That was already the
behaviour; what changes here is that it is now a choice rather than an
unexamined default.

### Why

**A stale row is more useful than a missing one.** The catalog is keyed by EAN
and its whole job is to answer "what is this barcode". A consumer holding a
receipt from last year still needs that answer, and deleting the row turns a
correct historical lookup into a miss. The cost of keeping a discontinued
product is one row; the cost of dropping it is a hole in every past receipt that
mentions it.

**Out of stock and discontinued are the same observation.** The drain already
distinguishes "Coop returned no item for this EAN" and records it as `skipped`
with `not stocked by Coop`. That signal cannot tell a delisted product from one
that is simply out of stock today. The census README records two runs an hour
apart differing by one product for exactly this reason. Acting on a signal that
ambiguous means deleting real products.

**There is no signal being generated anyway.** `queueEanIfMissing` answers
`known` for any EAN the catalog already holds, so nothing re-fetches a row that
exists. Delisting only becomes _detectable_ once a refresh path exists, and
there is no refresh path. A delisting policy today would be a policy about
events that never arrive.

### What would change this

Revisit when all three hold:

- A refresh path exists, so rows are re-read and `skipped` starts appearing for
  products already in the catalog.
- Several consecutive refreshes agree. One `skipped` is a stock-out; N in a row
  over weeks is a delisting. N is a decision for that day, not this one.
- Someone is actually harmed by the staleness. Today `fetchedAt` and the
  freshness block on the console say how old the data is, which is the honest
  disclosure and is cheaper than being right about delisting.

If it is revisited, **flag, do not delete.** A `delistedAt` beside `fetchedAt`
keeps the lookup working while telling a consumer the product is gone, which is
strictly more information than absence.

### The trap to know about first

`bumpCounter` is called with `+1` on insert in `upsertClean` and **never with
`-1` for the catalog keys.** There is no decrement path, for the catalog total,
the per-store totals, or `catalog:verified`. A delete added without one silently
corrupts every number the console and the site header now show, and the drift is
invisible until someone runs the counter rebuild.

So any future delete goes through a single guarded helper that decrements all
three, the way every queue write already goes through `model/queue.ts`. Not
optional, and not something to remember at the call site.
