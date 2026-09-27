# Matvis

![The catalog, the app and the connector side by side, over the shared UI and logic libraries](docs/assets/architecture.png)

Welcome to Matvis! It turns Swedish grocery receipts into data you can use:
what you bought, what it is, and what you ate.

Your receipts already list everything you bring home, and the big chains keep
them digitally for their members. They are still hard to use. Each receipt
stays inside its store's app, its lines read like `MJÖLK 15,95`, and nothing
says which milk that was or what is in it. Apps that track food work around
this by asking you to type it all in again.

Matvis reads the receipts instead. It is three separate things, and each one
works on its own:

- **The connector** gets your receipts out. Link a store account once with
  BankID, and it keeps your receipts synced in one format for every store. Your
  own programs can read them through its API. Coop works today.
- **The catalog** knows what a receipt leaves out. It is a public database of
  Swedish groceries keyed by barcode (EAN), with sizes, ingredients and
  nutrition, gathered from Coop and ICA.
- **The app** turns both into a pantry. It shows what you have at home, and
  asks for little more than a tap when something is finished. From those taps
  it works out what you ate.

## Using Matvis

Everything runs at [matvis.qrabbe.de](https://matvis.qrabbe.de).

1. Open the [connector](https://matvis.qrabbe.de/connector/), sign in, and
   link your Coop account with BankID. It syncs your receipts and keeps them up
   to date.
2. Under **Connect**, mint an API token.
3. Open the [app](https://matvis.qrabbe.de/app/) and paste the token.

The [catalog](https://matvis.qrabbe.de/catalog/) is open to everyone, no
account needed.

To build your own program, open the **Developers** tab in the connector or the
catalog. Each one documents its API and the versioned contract it returns,
`Receipt` or `CatalogItem`.

## Developing Matvis

Each of the three is a [Convex](https://convex.dev) backend with a React front
end, written in TypeScript and run with [Bun](https://bun.sh).

|           | Backend               | Front end                   |
| --------- | --------------------- | --------------------------- |
| Connector | `packages/connector`  | `packages/connector-portal` |
| Catalog   | `packages/catalog`    | `packages/catalog-portal`   |
| App       | `packages/app/convex` | `packages/app`              |

Around them, `packages/shared` holds the contracts all three agree on,
`packages/ui` is the design system built on `@wordpress/ui`, and
`packages/landing` is the start page.

### Getting started

You need Bun 1.2 or later and a Convex account.

```bash
bun install
```

Every backend is its own Convex project. Run `bunx convex dev` in its package
folder to create a deployment and keep it in sync while you work. This is also
what typechecks the `convex/` folders, which `tsc -b` skips.

Before anyone can sign in or link a store, the connector's deployment needs its
keys:

```bash
cd packages/connector
node scripts/generate-auth-keys.mjs
node scripts/generate-token-key.mjs
bunx convex env set SITE_URL http://localhost:5273
```

Guest sign-in works with just that. GitHub sign-in also needs `AUTH_GITHUB_ID`
and `AUTH_GITHUB_SECRET` from a GitHub OAuth app whose callback is
`<CONVEX_SITE_URL>/api/auth/callback/github`.

The catalog needs `COOP_EXTERNAL_API_KEY` to fetch from Coop, and
`CATALOG_ADMIN_PASSWORD` for its ingest console at `#/admin`. Set both with
`bunx convex env set`.

Each front end reads its deployment URLs from a `.env.local` in its own package
folder:

| Front end                   | Needs                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| `packages/connector-portal` | `VITE_CONNECTOR_CONVEX_URL`                                                   |
| `packages/catalog-portal`   | `VITE_CATALOG_CONVEX_URL`                                                     |
| `packages/app`              | `VITE_CONNECTOR_CONVEX_URL`, `VITE_CATALOG_CONVEX_URL`, `VITE_APP_CONVEX_URL` |

Then start the one you are working on:

```bash
bun run --filter @matvis/connector-portal dev   # localhost:5273
bun run --filter @matvis/catalog-portal dev     # localhost:5373
bun run --filter @matvis/app dev                # localhost:5173
bun run --filter @matvis/landing dev            # localhost:5473
bun run --filter @matvis/ui storybook           # localhost:6006
```

### Before you push

```bash
bun run format
bun run typecheck
bun run test
```

`bun run test` runs `bun test` over plain logic, then Vitest over anything that
needs Convex or a DOM. CI runs the same checks plus a secret scan and
`bun run spec:check`, which fails when the catalog's public API changed and
`bun run spec` was not run.

### Deploying

When CI passes on a push to `dev` or `main`, it deploys the connector and the
catalog to both their development and production Convex deployments. The app's
backend is not in CI yet. Deploy it with `bunx convex deploy` from
`packages/app`.

A push to `main` also rebuilds the site on
[statichost.eu](https://www.statichost.eu), which runs
[`tools/build-site.ts`](tools/build-site.ts). It builds the landing page at `/`
and the three front ends under `/connector/`, `/catalog/` and `/app/`, against
the `CONNECTOR_CONVEX_URL` and `CATALOG_CONVEX_URL` set in the site's settings.

A new catalog deployment starts empty. To copy dev's fixture of about 100
products into production, run this from `packages/catalog`:

```bash
bunx convex export --path catalog-snapshot.zip
bunx convex import --prod catalog-snapshot.zip
```
