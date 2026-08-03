# @matvis/app

Part of the **Matvis** monorepo

The end-user app: pantry, nutrition and purchase insight over the receipts the
connector syncs and the products the catalog holds. Seven tabs — **Pantry ·
Nutrition · Activity · Stats · Purchases · Unmapped · Preferences**.

## Read-only by construction

The app holds one credential: the account **API read token**, minted in the
connector portal under **Connect** and pasted into the app's token gate. That
paste is the whole of onboarding — there is no sign-in here. It is not read-only
by convention, it is unable to misbehave:

- `main.tsx` mounts `ConvexProvider` and never `ConvexAuthProvider`. Every
  connector write (`links.*`, `sync.sync`, `accessToken.create`) resolves its
  caller through `getAuthUserId`, which throws `Unauthenticated` with no session,
  so no write handler is reachable.
- The catalog exposes no public write at all — everything in `ingest.ts`,
  `raw.ts`, `ops.ts` and `backfill.ts` is `internal*`.
- Both typed facades (`lib/convexApi.ts`, `lib/catalogApi.ts`) declare nothing
  but `FunctionReference<'query', …>`.

Linking a store and syncing stay with the connector portal.

## Environment

Two deployments, so two URLs:

```
VITE_CONVEX_URL=          # the connector — ambient, reactive
VITE_CATALOG_CONVEX_URL=  # the catalog — called imperatively, cached by EAN
```

`useQuery` resolves one client from React context, so only one can be ambient.
The connector wins it (receipts are reactive and paginated); the catalog is
queried through its own client, since a product description that changes monthly
does not earn a live subscription. A missing catalog URL degrades the app to
"receipts work, products do not" rather than blanking the page.

## Shape

```
src/
  App.tsx                 tab shell + token gate
  lib/                    pure logic — units, nutrition, pantry, stats, unmapped,
                          dateRange, purchases (the join), plus the two facades,
                          the IndexedDB item cache and the token store
  hooks/usePurchaseData   the one data path: headers → items → products → coverage
  components/             presentational, incl. the validated chartTheme
  features/               one file per tab
test/lib/                 bun test over the pure logic
test/*.vitest.tsx         vitest + jsdom over the hook and the panels
```

Two runners, split by what a test needs rather than by taste: `test/lib` is pure
and runs under `bun test` in milliseconds, while anything that renders needs a
DOM and runs under vitest (`bun run test` in this package). The `.vitest.tsx`
suffix is what keeps `bun test` from picking the second set up.

Every tab reads from `usePurchaseData` and no tab talks to Convex directly, so
two screens cannot disagree about the same number. First load hydrates line items
per receipt behind a progress bar and caches them in IndexedDB; receipts are
immutable, so later loads cost roughly nothing.

## Coverage

`receiptItems.gtin` is the only join key between a receipt line and a product,
and it is filled from `itemGtinMap` — which starts empty, with nothing filling it
yet. So Pantry and Nutrition start near-empty by design. Every product-dependent
view carries a **coverage meter** as a first-class element rather than an error
state, and the **Unmapped** tab breaks the gap down: each row there is exactly
one future mapping, sized by how much coverage it would buy.

Purchases, Activity and Stats are header-derived and work fully today.
