# @matvis/shared

Part of the **Matvis** monorepo.

The contracts every other package agrees on: `Receipt` (`receipt.ts`),
`CatalogItem` (`catalog.ts`), the store registry (`stores.ts`) and the auth
shapes (`auth.ts`). Zod schemas, so the same definition is both the TypeScript
type and a runtime validator. Alongside them: the stored document shapes
(`documents.ts`), and the few pure functions both sides of a boundary have to
agree on — `normalizeItemText` (`matching.ts`), the receipt-level display helpers
and `chunk` (`format.ts`).

## The compile-time guards

Two packages assert at the type level that their Convex validators match the zod
contract exactly:

| Guard                                                                 | Asserts                              |
| --------------------------------------------------------------------- | ------------------------------------ |
| [`catalog/convex/model/fields.ts`](../catalog/convex/model/fields.ts) | `catalogFields` ≡ `CatalogItem`      |
| [`connector/convex/validators.ts`](../connector/convex/validators.ts) | the stored receipt shape ≡ `Receipt` |

Both use `Assert<Equal<A, B>>`, which is **mutual** assignability, so storage
cannot silently disagree with the contract: change one side and the build fails
until the other follows.
