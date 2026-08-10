# Matvis

Matvis turns your Swedish grocery receipts into clear, structured purchase data and eventually into pantry and nutrition insight.
It's a combination of independent systems so custom user programms can be developed.

---

## Usage

Three things are live and open right now:

- the **connector portal** — link a grocery store, browse the receipts it syncs,
  and mint the account API token
- the **catalog portal** — search the EAN-keyed product catalog, no account needed
- the **Matvis app** — pantry, nutrition and purchase insight over your receipts

The app has no sign-in of its own. You paste the API token minted in the connector
portal, which is what keeps the app structurally unable to write. Its Purchases,
Activity and Stats tabs are complete; Pantry and Nutrition start near-empty until the
receipt-line-to-product matching lands, and the **Unmapped** tab measures that gap.

The connector portal's **Developers** tab documents the receipt API and the versioned
data contract you can build custom programs on.

If you're a developer, head to [Getting started](#getting-started).

---

## The projects

![Matvis architecture: catalogue, app and connector systems with shared UI and logic libraries](docs/assets/architecture.png)

The repo is one monorepo containing **six systems** plus **two shared libraries**.
Status is called out per system: ✅ **Live** means deployed and usable at its public
path today, 🚧 means not deployed yet. A live system can still be missing planned
features — those are named in its description.

**Naming convention:** each system is a backend package `<name>` plus its UI package
`<name>-portal` — so `connector` ↔ `connector-portal` and `catalog` ↔ `catalog-portal`.
Shared libraries keep bare names (`shared`, `ui`), and the end-user app is `app`.
New systems follow the same pair.

| Package                                         | What it is                                                                                                                                                                                                             | Status  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [`connector`](packages/connector)               | **The receipt connector.** A standalone service that links a store account and syncs purchases into normalized data which gets exposed through an API.                                                                 | ✅ Live |
| [`connector-portal`](packages/connector-portal) | **The connector's web UI.** A link/setup flow (BankID QR, connection status) plus a "for developers" portal documenting the API and the versioned `Receipt` contract. Talks only to the connector's Convex deployment. | ✅ Live |
| [`app`](packages/app)                           | **The Matvis user app.** The consumer-facing frontend for nutrition, pantry and charts, read-only over both deployments. Onboarding is the API token pasted in. Pantry and Nutrition wait on receipt-line matching.    | ✅ Live |
| [`catalog`](packages/catalog)                   | **Product-data mirror.** A database that hosts GTIN/EAN, product, nutrition, price data, focusing on swedish grocery store items. Coop and ICA ingest and the clean-table projector run; more chains land later.       | ✅ Live |
| [`catalog-portal`](packages/catalog-portal)     | **The catalog's web UI.** A search box + table over the clean, EAN-keyed catalog table, plus a "for developers" tab documenting the read API and the versioned `CatalogItem` contract. No auth — public read-only.     | ✅ Live |
| [`landing`](packages/landing)                   | **The distributor page.** A static landing page (no build) served at the site root, with a card linking to each of the three frontends.                                                                                | ✅ Live |

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
- **Tests:** `bun test` for pure code, `vitest` for everything that needs an
  environment — `convex-test` on the edge runtime, components on jsdom

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
| `CATALOG_ADMIN_PASSWORD`                                  | catalog backend | ingest console sign-in (`#/admin`)    |
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

# Matvis user app (paste an API token from the connector portal to get in)
bun run --filter @matvis/app dev                 # http://localhost:5173
```

### 5. Design system (optional)

```bash
bun run --filter @matvis/ui storybook            # http://localhost:6006
```

---

## Common scripts (run from the repo root)

| Command                | Does                                             |
| ---------------------- | ------------------------------------------------ |
| `bun run typecheck`    | `tsc -b` typechecks and builds every package     |
| `bun run build`        | same as typecheck (`tsc -b`)                     |
| `bun run test`         | `bun test`, then `vitest run` over every project |
| `bun run format`       | Prettier write                                   |
| `bun run format:check` | Prettier check                                   |
| `bun run clean`        | `tsc -b --clean`                                 |

Per-package tasks use Bun's filter, e.g. `bun run --filter @matvis/connector test`.

---

## Deployment

Backend and frontend ship from two different places.

**Backends** deploy from CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). On a
push to `main`, after format · typecheck · build · test · secret-scan all pass, the deploy
job runs `convex deploy` for each project against its production deployment, then triggers
the statichost build so the site is never rebuilt ahead of the backends it talks to.

| Path          | Content                           | Convex project     | Deploy-key secret           |
| ------------- | --------------------------------- | ------------------ | --------------------------- |
| `/`           | landing page (`packages/landing`) | —                  | —                           |
| `/connector/` | connector-portal                  | (connector)        | `CONVEX_DEPLOY_KEY`         |
| `/catalog/`   | catalog-portal                    | `matvis-catalogue` | `CONVEX_DEPLOY_KEY_CATALOG` |
| `/app/`       | user app (`packages/app`)         | both, read-only    | —                           |

**The site** is built by statichost.eu from this repo ([`statichost.yml`](statichost.yml)),
which runs [`tools/build-site.ts`](tools/build-site.ts). That script builds each frontend
with `PORTAL_BASE` set to its sub-path so asset URLs resolve, hands each build its Convex
URLs from `CONNECTOR_CONVEX_URL` / `CATALOG_CONVEX_URL` (set in the site's settings — the
app gets both, as `VITE_CONVEX_URL` and `VITE_CATALOG_CONVEX_URL`), and assembles everything
into `_site`: the landing page at the root, each portal and the app under its own path. The root is a static distributor page
([`packages/landing/index.html`](packages/landing/index.html)) with a card linking to each
portal and to the app.

Because the site tracks whichever branch statichost is pointed at while the backends only
move on a push to `main`, building the site from a feature branch serves that branch's
frontend against production's backend.

### Seeding the catalog's production data

Source payloads are **not** stored, on either chain. A product is projected into `catalog`
at fetch time and the Coop response or the ICA page is discarded, so there is no raw table
to replay: changing a projector means refetching through the source's rate limit, not
rebuilding locally.

Two tables carry the pipeline. `eans` is a flat worklist of every barcode we have heard
of per chain, and `catalog` holds the projected products. The difference between them is
the work left to do, which is what
[`ingest.queueMissingEans`](packages/catalog/convex/ingest.ts) walks — the action, over the
paged [`queueMissingPage`](packages/catalog/convex/ingest.ts) mutation: it pages `eans`,
queues whatever `catalog` has no row for, and persists its cursor in `ingest_settings` so
successive runs continue the pass rather than rescanning. It then hands over to the fetch
unconditionally, because a sweep that queued nothing is exactly the case where the queue
already holds the work.

A fresh production deployment starts empty. The simplest fill is a snapshot copy from the
dev deployment — from `packages/catalog` (where `--prod` resolves to `matvis-catalogue`'s
production deployment):

```bash
bunx convex export --path catalog-snapshot.zip   # from dev (giant-yak-747)
bunx convex import --prod catalog-snapshot.zip    # into production
```

Note that dev is deliberately kept to ~100 representative products spanning every category,
so a copy in that direction seeds a fixture rather than a full catalog.

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
