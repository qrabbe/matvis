# Catalog decisions

Choices that are not visible in the code, because the code's answer is silence.

---

## Releases

**Decided: a git tag, and nothing else.** There is no CHANGELOG and the
workspace root stays at `version: 0.0.0` — it is private and never published, so
a number there would be a number nobody reads. The tag is the cheapest marker
that is still a real one: it names a commit, and `git describe` answers what a
deployment is.

### v0.0.1 — the ICA lane

Tagged on the commit that closes the end-to-end run against the live source.
What it contains:

- A second ingest lane. ICA products are fetched one page per product, parsed
  out of the page microdata, and written to the same `(EAN, store)` catalog.
- The lane split that made a fan-out lane safe: a bad page fails its own row,
  and only 401, 403 and 429 still take the batch and the chain.
- A chain guard for the batch where nothing progressed.
- Reads of the writer's answer on both lanes, so a write that stored nothing
  stops reporting `stored`.
- ICA reachable from the admin console, on the same run, queue and log surfaces
  as Coop.

Still deliberately absent: any scheduled run. See the two **blocker** entries
below and the entry criteria in the roadmap.

---

## The first live ICA run, 2026-08-10

**Decided: three of the five census predictions stand as written, one was wrong
about which range it described, and one was never testable on this deployment.
The numbers below replace the guesses, and where nothing was measured that is
said rather than filled in.**

Run against `dev:giant-yak-747`, batch size 25 and concurrency 5 untouched,
crons off, every press started by hand. 34 437 EANs loaded, 6 825 drained
through the lane, plus a 607 page sample fetched beside it with the same URL,
headers, timeout and concurrency the lane uses.

| Claim                                   | Predicted | Measured                                    |
| --------------------------------------- | --------- | ------------------------------------------- |
| product ids that 404                    | ~7%       | **0** of 6 825 drained and 0 of 607 sampled |
| census names that resolve a size        | 19 456    | **19 456**, and 10 ambiguous                |
| ids that fail with something not a 404  | ~50       | **0** of 7 432 requests                     |
| EAN on the page differs from the census | 0         | **0**                                       |
| range that overlaps Coop                | ~a third  | **not testable here**                       |

### What the lane did

6 825 rows claimed, 6 825 stored, 0 skipped, 0 failed. Not one of the four
`skipped` memos was written, and the queue holds zero skipped rows. Each batch
of 25 settled in 1.7 to 2.1 seconds. 27 612 rows are still pending, deliberately:
the deliverable is this entry, not a drained queue, and the sample answers what
the remaining rows would have.

Field coverage over the 6 825: `imageUrl` and `categoryPath` on all but one,
`brand` on 6 700, `netContent` on 3 837, nutrition on 1 936. The `netContent`
share, 55.4%, sits where the whole-census name measurement says it should
(19 456 of 34 437 is 56.5%) and where the sample put it (57.3%).

### The 7% was a rate over a different range

The census crawl started from 34 172 sitemap ids and kept the ones that
answered. `ica-eans.csv` is therefore, by construction, the ids that resolved,
so a 404 rate measured over the seeds says nothing about a load driven by the
CSV. Zero over 7 432 live requests two days after the crawl.

The `product: null` arm stays. It is right about what a 404 means and it is the
only thing standing between a disappeared id and an infinite retry. It is now
documented as defensive, which is what it is.

### `data/ica/skip.txt` never supported the claim it was cited for

The "~50 ids fail with something other than 404" prediction cited that file. It
is not a list of poison ids. It is the first 50 lines of `ica-eans.csv` in EAN
order, it contains EANs rather than product ids, and nothing in the repo reads
it. All 50 were in the first 75 rows drained and all 50 stored.

It is untracked, like everything under `packages/catalog/data`, so it is a local
scratch file that outlived its purpose and got quoted as evidence. Left in place
because deleting another operator's untracked file is not this step's business.

### What ICA does when it refuses is still unknown

7 432 requests at concurrency 5 produced 607 sampled `200`s and 6 825 lane
successes, no 401, no 403, no 429, no 5xx, and no `x-amzn-waf-action` header on
any response. The lane never had to exercise `CALLER_WIDE_STATUSES`.

So the split in `ica/fetch.ts` — 401, 403 and 429 caller-wide, everything else
per row — remains a reasoned guess and not a measurement. The nasty case the
step went looking for, a `200` carrying a WAF challenge that parses to `null`
and settles as `no public ICA page`, did not appear and cannot be ruled out from
this run. It stays a known unknown rather than a confirmed shape.

### The timeout is generous by a factor of about seventy

p50 136 ms, p95 220 ms, slowest of 607 pages 544 ms, against a
`REQUEST_TIMEOUT_MS` of 15 000. Nothing came close to it, so the question step 21
opened — too low and healthy pages fail, too high and a hung socket eats the
budget — is answered on the first half only. Leave it. The margin costs nothing
while runs are started by hand, and the sample cannot say what a hung socket
would do because it never met one.

### The queue drains the interesting rows last

`ica-eans.csv` is sorted with the 307 `listed=0` rows at the end, and those are
the weight-priced in-store-barcode items most likely to have no public page.
The loader preserves that order, `claimPendingEans` takes the oldest rows first,
and a row that is re-enqueued gets a newer creation time and lands further back
still. There is no way to reach the tail except to drain everything ahead of it.

That is why the 404 and refusal questions were settled beside the lane rather
than through it. Worth knowing before the next lane is loaded from a sorted
file: whatever a census sorts to the bottom is what an operator will see last,
which is the opposite of what a first run wants.

All 307 unlisted ids answered `200` and parsed, so the tail was not hiding
anything this time.

### One press is mostly not a drain

`admin.startRun` hands the same `batches` number to both halves of a run. At the
console's ceiling of 30 that means the fill sweep walks 30 pages of 500 `eans`
rows, 15 000 of them, before the first batch of 25 is fetched. On a lane whose
queue is already loaded the sweep finds nothing on every one of those pages, and
a 750 row press spends the larger part of 90 to 140 seconds re-scanning.

Not changed here, because the sweep is what makes the one button correct and
step 27 already decided against touching `model/queue.ts` this late. Recorded so
the next person reading a slow press knows it is the sweep and not ICA.

### Nothing diverged from the stubs, so no test changed

Every live outcome was `stored`, which `ica-lane.vitest.ts` already covers. The
step's rule was that a divergence becomes a test rather than a note. There was
no divergence. The corrections above are all to prose and to one comment in
`ica/fetch.ts`, because they are claims about ICA rather than about the lane,
and a test that asserts ICA's 404 rate would be a test of the internet.

---

## The failure paths, and which of them are acceptable

Read off the code and pinned by `convex/failures.vitest.ts` for the Coop lane
and `convex/ica-lane.vitest.ts` for the ICA one. Every behaviour
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

### One bad response fails the whole Coop batch, and stops the chain

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

### A failed ICA page fails only itself

**Decided, and deliberately the opposite of the rule above.** The reasoning
behind the batch-wide rule is Coop's shape, not a house style: one request, so a
refusal is a statement about the caller. An ICA batch is 25 requests, and a 500
or a hung socket on one of them is a statement about one product page. Failing
the other 24 with it is what kept the lane pinned on the same poison id, run
after run, fetching nothing.

So `fetchOne` catches per page and returns the error on that page alone, and
only the statuses that really are about the caller — 401, 403, 429 — still throw
out of `fetchByProductId` and take the batch and the chain with them. A page
that answered badly is settled `failed`, so the row returns to `pending` and the
next run retries it, because a 500 or a timeout is usually transient. A page
that is permanently broken therefore retries forever, which is the uncapped
`attempts` question above and is acceptable only because the failure now costs
one row rather than the lane.

Pinned by `convex/ica-lane.vitest.ts`.

### A 404 from ICA is an outcome, not a failure

**Decided.** `fetchByProductId` answers `{ product: null }` for a 404 rather
than an error, and the lane settles that row `skipped` with
`no public ICA page for this product`. It is the ICA twin of Coop's
`not stocked by Coop`: the source answered, and the answer is that the product
is not there.

Treating it as a failure would be wrong in both directions. The row would return
to `pending` and be re-requested on every run forever, and the run summary would
carry a `failed` count that says the crawl is broken when it is working exactly
as intended.

The rate is low but not zero, and it is not evenly spread. The census opened
34 479 pages and every one of them rendered, so a row loaded from the worklist
almost never 404s. The 404s live in the ids the census could not see: sampling
300 real product ids from one store's assortment found 18 absent from the census
CSV, and 7 of those 18 answer 404 on the public site because they exist only
inside that store. See `data/ica/README.md`. So the memo is mostly a statement
about hand-enqueued or store-scoped ids, and it will get more common if
discovery ever widens past the public crawl.

### An ICA row is addressed by `sourceId`, not by its EAN

**Decided, and it is why `sourceId` is on two tables.** A Coop row is fetched by
barcode, so the EAN is both the key and the address. An ICA page is reached at
`/produkt/{id}` and nothing on ICA resolves an EAN to that id, so an EAN alone
cannot fetch anything.

That is the reason `eans` and `ingest_queue` both carry `sourceId`, and the
reason forwarding it from `fetchIca` into `upsertIcaByEan` is load-bearing
rather than tidy: `rememberEan` is what records a barcode as addressable, and a
row written without it is permanently un-refetchable the day a refresh path
exists.

It is also why a claimed row with no `sourceId` settles **`skipped`** with
`no ICA product id for this EAN` rather than `failed`. `failed` means "try
again", and there is nothing to try — retrying would fail identically forever.
Only a barcode enqueued by hand can be in that state, because the census supplies
an id for every row it loads.

### A write that stored nothing settles `skipped`, not `stored`

**Decided, on both lanes.** `upsertCoopByEan` and `upsertIcaByEan` return
`{ stored }`, and the lanes read it instead of taking the absence of a throw as
success.

The bug this closes was live on Coop. `project()` returns `null` for a payload
with no `ean` **or no `name`**, and sanitizing only drops undeclared keys, so a
Coop item with a barcode and no name wrote nothing, reported `stored`, and had
its queue row deleted — leaving no catalog row for the fill sweep to find, which
queued it again on the next pass. The same loop as the EAN-mismatch case below,
on the busier lane, with no memo to explain it.

The memos are deliberately distinct — `Coop item projected to nothing (no name)`
and `ICA page projected to nothing (no ean or no name)` — rather than reusing
`not stocked by Coop`. The source did return something; it was unusable, and the
console shows this text to whoever has to tell those two apart.

### A batch that made no progress stops the chain

**Decided.** A thrown lane already stops the chain. This is the case where
nothing threw and every row still failed anyway — 25 pages that all timed out,
say. Those rows go back to `pending` carrying their original `enqueuedAt`, so
they remain the oldest work on `by_store_status` and the next batch would claim
the same barcodes and do the same thing again for as many batches as the run was
given.

Any row that was stored or skipped left the lane for good, so a batch with even
one of those means the next batch sees new work and the chain continues. Only an
entirely failed batch stops it.

**The predicate is "not everything failed", not "something was stored", and the
difference is the trap.** A batch of 25 pure skips — every id 404, every row
missing its `sourceId` — stored nothing at all and still made progress, because
all 25 rows are terminal and gone from `by_store_status`. Stopping there would
halt a drain that is working perfectly through a stretch of absent products.
Progress means the queue moved, not that the catalog grew.

Note that this is a per-batch rule and not a retry cap: the next run still claims the same rows, which is the intended
behaviour and the reason the stop is cheap to keep.

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

The per-page ICA split above narrows the blast radius without lifting the
blocker. A poison row used to pin its whole batch, so the uncapped retry burned
25 requests a pass; now it burns one and the other 24 make progress. That is why
this stayed deferred rather than becoming urgent — it went from a lane-wide
stall to a single row retrying forever, which is a slow leak rather than a halt.
It is still uncapped.

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

### An ICA page that resolves to a different EAN is trusted

**Decided: trust the page.** A queue row claims `ean = X` at `sourceId = P`, and
page `P` states `ean = Y`. The write goes under `Y`, `rememberEan('ica', Y, P)`
records it as addressable, and the claimed row for `X` is settled `skipped` with
`ICA page P resolves to EAN Y`.

**Measured at zero.** Joining the 34 437 row census worklist against the crawl
cache on `sourceId` found no page whose parsed EAN differs from the claimed one,
and no parsed EAN shared by two product ids. The branch is three lines and is
kept as a guard rather than because the case was observed.

Without it the lane loops: the catalog gains `[Y, 'ica']` and still has no
`[X, 'ica']`, so the fill sweep re-queues `X`, the drain fetches page `P` again,
and it repeats one ICA request per pass per affected product, forever.

The `skipped` memo is load-bearing here for the same reason it is under
**A missing product is skipped**: `queueEanIfMissing` treats any existing queue
row as a duplicate, so the surviving row for `X` is the only thing stopping the
sweep re-queueing it. Tidying up skipped rows reopens the loop.

Note the shape: the row is settled `skipped` **after** a successful write.
Everywhere else in the lane `stored` and `skipped` are mutually exclusive, and
this is the one place where both are true of the same claimed row.

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
