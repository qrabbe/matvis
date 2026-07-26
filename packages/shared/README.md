# @matvis/shared

Part of the **Matvis** monorepo.

The versioned contracts every other package agrees on: `Receipt` (`receipt.ts`),
`CatalogItem` (`catalog.ts`), the store registry (`stores.ts`) and the auth
shapes (`auth.ts`). Zod schemas, so the same definition is both the TypeScript
type and a runtime validator.

Each contract's own versioning policy is documented next to its
`*_SCHEMA_VERSION` constant. This file covers something the policy does not: what
actually happens across the repo when you change one.

## Blast radius

Five packages depend on this one — `catalog`, `catalog-portal`, `connector`,
`connector-portal`, `app` — and they are wired with TypeScript project
references, so `tsc -b` rebuilds all of them from one edit here. There is no
gradual rollout inside the repo. A contract change either lands everywhere in one
commit or it does not compile.

That is the intended design. The consequence worth internalising is this:

> **The versioning policy's "adding a field does NOT bump the version" is a
> statement about the wire, not about the build.** In-repo, every change here is
> a breaking change until its mirrors are updated in the same commit.

### The compile-time guards

Two packages assert at the type level that their Convex validators match the zod
contract exactly:

| Guard                                                                 | Asserts                              |
| --------------------------------------------------------------------- | ------------------------------------ |
| [`catalog/convex/model/fields.ts`](../catalog/convex/model/fields.ts) | `catalogFields` ≡ `CatalogItem`      |
| [`connector/convex/validators.ts`](../connector/convex/validators.ts) | the stored receipt shape ≡ `Receipt` |

Both use `Assert<Equal<A, B>>`, which is **mutual** assignability. Adding a field
to a contract and nothing else fails the build — the validator now has fewer
fields than the type. This is the guard working, not an obstacle: storage cannot
silently disagree with the contract.

Direct type consumers fail the build too, which is equally desirable:
`app/src/lib/catalogApi.ts` and `catalog-portal/src/lib/convexApi.ts` both derive
their row type from `CatalogItem`, so a removed field surfaces at every read site.

### The mirrors that do NOT fail the build

One place copies the contract by hand and will silently rot:

- [`catalog-portal/src/features/DevPortal.tsx`](../catalog-portal/src/features/DevPortal.tsx)
  — `CATALOG_FIELDS`, `FOOD_FIELDS` and `NUTRITION_FIELDS` are hand-typed arrays
  whose `note` strings are retyped JSDoc. They are the **public API
  documentation**. Nothing checks them.

Until [ticket 12](../../tickets/12-contract-driven-dev-portal.md) generates that
page from the schema, updating it is a manual step in every contract change, and
it belongs on the checklist below rather than in someone's memory.

## The runtime layer, which is where the ordering bites

Type checking is the easy half. Convex adds two runtime constraints that decide
the _sequence_ a contract change has to land in:

1. **Schema validation runs on push.** Convex checks every existing document
   against the new schema when you deploy. A schema that removes or retypes a
   field is rejected while stored rows still carry the old shape — so you cannot
   deploy the code that would migrate them. Changing a contract in a way that
   invalidates stored data is a **two-deploy** operation, not one.
2. **`returns:` validators are enforced per call.** The catalog's public queries
   declare `returns: v.array(catalogDocValidator)`. If deployed code expects the
   new shape and a stored row still has the old one, the query _throws_ rather
   than returning a partial row. Every reader breaks for the length of the
   backfill window, not just the field that changed.

Neither applies to a purely additive optional field, which is the cheap case and
the reason to prefer it when there is a real choice.

## Changing a contract: the checklist

1. Edit the zod schema here. Decide the version bump per the policy comment.
2. Mirror it into the Convex validators until the `Assert<Equal<…>>` guards pass.
3. Update the projector (`catalog/convex/model/project.ts`) or parser that
   produces the field, and its tests.
4. Update the typed readers the compiler points you at.
5. Update `DevPortal.tsx` by hand. Nothing will remind you.
6. `bun run typecheck && bun test && bun run format`.
7. **Plan the deploy** if stored documents change shape: pause ingest, deploy
   with `schemaValidation: false`, backfill, re-enable validation, deploy again.
   Expect reads to fail in between and pick the window accordingly.
8. Verify against the live deployment, not just the tests.

## One thing that gets cheaper the sooner you do it

Every contract here is currently consumed **only inside this repo**, which is
what makes a breaking change a same-commit refactor rather than a migration.
[Ticket 12](../../tickets/12-contract-driven-dev-portal.md) proposes publishing
`@matvis/catalog-client` to npm. The day that ships, `CatalogItem` acquires
consumers who cannot be fixed in the same commit, and the versioning policy
starts applying literally — `upcast` functions, two live versions, the lot.

**Breaking contract changes are close to free until then, and materially
expensive afterwards.** That is a sequencing argument, and it is why
[ticket 16](../../tickets/16-catalog-net-content.md) should land before ticket 12
rather than after.
