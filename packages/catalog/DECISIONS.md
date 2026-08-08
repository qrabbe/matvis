# Catalog decisions

Choices that are not visible in the code, because the code's answer is silence.

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
three, the way every queue write already goes through `model/ops.ts`. Not
optional, and not something to remember at the call site.
