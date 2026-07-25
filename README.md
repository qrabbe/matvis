# Matvis

Matvis turns your Swedish grocery receipts into clear, structured purchase data and eventually into pantry and nutrition insight.
It's a combination of independent systems so custom user programms can be developed.

---

## Usage

Right now the one thing you can actually use is the **connector portal**. It lets you:

- link a grocery store
- browse the receipts it syncs for you

Today that portal is most useful to **developers**. The **Developers** tab documents
the receipt API and the versioned data contract you can build custom programs on. The
Matvis app that turns all of this into pantry and nutrition insight is still in progress.

If you're a developer, head to [Getting started](#getting-started).

---

## The projects

![Matvis architecture: catalogue, app and connector systems with shared UI and logic libraries](docs/assets/architecture.png)

The repo is one monorepo containing **six systems** plus **two shared libraries**.
Not everything is built yet — status is called out per system.

**Naming convention:** each system is a backend package `<name>` plus its UI package
`<name>-portal` — so `connector` ↔ `connector-portal` and `catalog` ↔ `catalog-portal`.
Shared libraries keep bare names (`shared`, `ui`), and the end-user app is `app`.
New systems follow the same pair.

| Package                                         | What it is                                                                                                                                                                                                             | Status         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| [`connector`](packages/connector)               | **The receipt connector.** A standalone service that links a store account and syncs purchases into normalized data which gets exposed through an API.                                                                 | ✅ Live        |
| [`connector-portal`](packages/connector-portal) | **The connector's web UI.** A link/setup flow (BankID QR, connection status) plus a "for developers" portal documenting the API and the versioned `Receipt` contract. Talks only to the connector's Convex deployment. | ✅ Live        |
| [`app`](packages/app)                           | **The Matvis user app.** The consumer-facing frontend for nutrition, pantry and charts built on top of the connector.                                                                                                  | 🚧 In progress |
| [`catalog`](packages/catalog)                   | **Product-data mirror.** A database that hosts GTIN/EAN, product, nutrition, price data, focusing on swedish grocery store items                                                                                       | 🚧 In progress |
| [`catalog-portal`](packages/catalog-portal)     | **The catalog's web UI.** A search box + table over the clean, EAN-keyed catalog table, plus a "for developers" tab documenting the read API and the versioned `CatalogItem` contract. No auth — public read-only.     | 🚧 In progress |
| [`landing`](packages/landing)                   | **The distributor page.** A static landing page (no build) served at the Pages root, with a big card linking to each portal. Room for a third card once the app ships.                                                 | ✅ Live        |

### Shared libraries

| Package                     | What it is                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`shared`](packages/shared) | Versioned, zod-validated contracts shared across every package.                                                                                         |
| [`ui`](packages/ui)         | The design system, built on the WordPress design system (`@wordpress/ui` + `@wordpress/theme`) with a dark theme and Storybook built for the frontends. |

---

## Tech stack

- **Runtime / package manager:** [Bun](https://bun.sh) `>= 1.2`
- **Language:** TypeScript 5.9, project references, `tsc -b`
- **Backend:** [Convex](https://convex.dev)
- **Frontends:** React 18 + [Vite](https://vitejs.dev) 8 (`app`, `connector-portal`)
- **Design system:** `@wordpress/ui` + `@wordpress/theme`, Storybook 10
- **Tests:** `bun test` for pure code, `vitest` + `convex-test` for Convex functions

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.2`
- Git
- A [Convex](https://convex.dev) account/deployment for running `connector` (a local
  self-hosted deployment works too)

### 1. Install

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Then fill in the values you need. `.env.example` documents variable names only
Relevant vars:

| Variable                                                  | Used by         | Purpose                               |
| --------------------------------------------------------- | --------------- | ------------------------------------- |
| `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL`                | frontends       | Convex deployment the client talks to |
| `CONVEX_SELF_HOSTED_URL` / `CONVEX_SELF_HOSTED_ADMIN_KEY` | `connector`     | self-hosted Convex backend            |
| `COOP_EXTERNAL_API_KEY`                                   | product lookups | public product API key                |
| `VITE_SENTRY_DSN`                                         | frontends       | error reporting (optional)            |

### 3. Run the connector backend

The connector has its own Convex deployment. From `packages/connector`:

```bash
cd packages/connector
bunx convex dev          # watch loop: pushes + typechecks convex/
# or, for a single push + typecheck:
bunx convex dev --once
```

> Note: the `convex/` directory is typechecked by Convex itself, not by the root
> `tsc -b`. Run `convex dev` to catch errors there.

### 4. Run a frontend

```bash
# Connector portal (link a store, browse receipts, read the API docs)
bun run --filter @matvis/connector-portal dev   # http://localhost:5273

# Catalog portal (search the product catalog, read the API docs)
bun run --filter @matvis/catalog-portal dev     # http://localhost:5373

# Matvis user app (in progress)
bun run --filter @matvis/app dev                 # http://localhost:5173
```

### 5. Design system (optional)

```bash
bun run --filter @matvis/ui storybook            # http://localhost:6006
```

---

## Common scripts (run from the repo root)

| Command                | Does                                         |
| ---------------------- | -------------------------------------------- |
| `bun run typecheck`    | `tsc -b` typechecks and builds every package |
| `bun run build`        | same as typecheck (`tsc -b`)                 |
| `bun run test`         | `bun test`                                   |
| `bun run format`       | Prettier write                               |
| `bun run format:check` | Prettier check                               |
| `bun run clean`        | `tsc -b --clean`                             |

Per-package tasks use Bun's filter, e.g. `bun run --filter @matvis/connector test`.

---

## Deployment

CI is one pipeline ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). On a push
to `main`, after format · typecheck · build · test · secret-scan all pass, the deploy
job ships each portal's Convex backend to production and builds the portal against the
URL it just deployed. GitHub Pages serves **one site per repo**, so a static landing
page and both portals ship in a single artifact:

| URL                                  | Content                           | Convex project     | Deploy-key secret           |
| ------------------------------------ | --------------------------------- | ------------------ | --------------------------- |
| `qrabbe.github.io/matvis/`           | landing page (`packages/landing`) | —                  | —                           |
| `qrabbe.github.io/matvis/connector/` | connector-portal                  | (connector)        | `CONVEX_DEPLOY_KEY`         |
| `qrabbe.github.io/matvis/catalog/`   | catalog-portal                    | `matvis-catalogue` | `CONVEX_DEPLOY_KEY_CATALOG` |

The root is a static distributor page ([`packages/landing/index.html`](packages/landing/index.html))
with a card linking to each portal. Each portal's `vite build` runs with `PORTAL_BASE`
set to its sub-path so asset URLs resolve under Pages, and the landing page plus both
`dist/` folders are combined into one artifact (landing at the root, connector under
`/connector/`, catalog under `/catalog/`) before upload.

### Seeding the catalog's production data

The `catalog` table is derived: Coop products land in `raw_coop`, and
[`backfill.rebuildCleanFromRaw`](packages/catalog/convex/backfill.ts) projects them into
the clean `catalog` table the portal reads. A fresh production deployment starts empty.
The simplest fill is a snapshot copy from the dev deployment — from `packages/catalog`
(where `--prod` resolves to `matvis-catalogue`'s production deployment):

```bash
bunx convex export --path catalog-snapshot.zip   # from dev (giant-yak-747)
bunx convex import --prod catalog-snapshot.zip    # into production
```

---

## Building on the connector API

The connector exposes a reactive read + subscribe API over Convex. Every receipt is
normalized to a store-agnostic, versioned `Receipt` contract
([`packages/shared/src/receipt.ts`](packages/shared/src/receipt.ts)) — store,
timestamp, totals, VAT, and GTIN-keyed line items.

Point a Convex client at the connector deployment and pull receipts as they land:

```ts
import { ConvexClient } from 'convex/browser';
import { api } from './convex/_generated/api'; // the connector's generated API

const client = new ConvexClient(process.env.CONVEX_URL!);

// Reactive: the callback re-fires every time a sync inserts new receipts.
client.onUpdate(api.receipts.changes, { since: 0 }, (res) => {
  for (const receipt of res.receipts) {
    console.log(receipt.store.name, receipt.total, receipt.currency);
  }
  // Pass `res.cursor` back as `since` to page forward or resume later.
});
```

Available endpoints (all scoped to one account):

| Endpoint              | Does                                    | Status     |
| --------------------- | --------------------------------------- | ---------- |
| `receipts.list`       | Paginated receipt headers, newest first | ✅ Live    |
| `receipts.getReceipt` | One header plus its line items          | ✅ Live    |
| `receipts.getPdf`     | Signed URL for the original receipt PDF | ✅ Live    |
| `receipts.changes`    | Incremental cursor-pull of new receipts | ✅ Live    |
| webhooks / push       | Server-push on new receipts             | 🚧 Planned |

> Every call is scoped to the caller's account, resolved server-side from the
> authenticated identity. Per-app grant tokens land later.
