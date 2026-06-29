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

The repo is one monorepo containing **four systems** plus **two shared libraries**.
Not everything is built yet — status is called out per system.

| Package                                         | What it is                                                                                                                                                                                                             | Status                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [`connect`](packages/connect)                   | **The receipt connector.** A standalone service that links a store account and syncs purchases into normalized data which gets exposed through an API.                                                                 | ✅ Live               |
| [`connector-portal`](packages/connector-portal) | **The connector's web UI.** A link/setup flow (BankID QR, connection status) plus a "for developers" portal documenting the API and the versioned `Receipt` contract. Talks only to the connector's Convex deployment. | ✅ Live               |
| [`app`](packages/app)                           | **The Matvis user app.** The consumer-facing frontend for nutrition, pantry and charts built on top of the connector.                                                                                                  | 🚧 In progress        |
| [`catalog`](packages/catalog)                   | **Product-data mirror.** A database that hosts GTIN/EAN, product, nutrition, price data, focusing on swedish grocery store items                                                                                       | 🚧 Not started (stub) |

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
- A [Convex](https://convex.dev) account/deployment for running `connect` (a local
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
| `CONVEX_SELF_HOSTED_URL` / `CONVEX_SELF_HOSTED_ADMIN_KEY` | `connect`       | self-hosted Convex backend            |
| `COOP_EXTERNAL_API_KEY`                                   | product lookups | public product API key                |
| `VITE_SENTRY_DSN`                                         | frontends       | error reporting (optional)            |

### 3. Run the connector backend

The connector has its own Convex deployment. From `packages/connect`:

```bash
cd packages/connect
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

Per-package tasks use Bun's filter, e.g. `bun run --filter @matvis/connect test`.

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
