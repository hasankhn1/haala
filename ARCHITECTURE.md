# Haala — Architecture

Quick-commerce (dark-store grocery delivery) platform: a customer app, a rider
app, and a backend serving both. This document is the source of truth for
technical direction; update it as decisions change.

## Stack

| Layer         | Choice                                              |
| ------------- | --------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo                         |
| Backend       | Node.js + Express + TypeScript                      |
| Data          | PostgreSQL 16 (Drizzle ORM), Redis 7                |
| Realtime      | socket.io (order + rider live updates)              |
| Auth          | JWT access + refresh (rotation, Redis-backed)       |
| Mobile        | React Native + Expo (customer + rider)              |
| Shared code   | `@haala/shared` (types + contracts), `@haala/design-tokens` |
| Local infra   | Docker Compose (Postgres + Redis)                   |

## Repository layout

```
haala/
├── apps/
│   ├── api/          Express backend  (controller → service → repository)
│   ├── customer/     Expo Router RN customer app (React Query + socket.io)
│   ├── rider/        Expo Router RN rider app (queue + delivery workflow)
│   └── dashboard/    Next.js ops dashboard (orders, riders, pricing, staff)
├── packages/
│   ├── shared/       Domain enums, money helpers, zod API contracts
│   ├── design-tokens/ Colors, spacing, typography, radii, elevation
│   └── ui/           Shared RN component library (built on design-tokens)
├── docker-compose.yml
└── turbo.json
```

The apps and the API all import `@haala/shared` so request/response contracts
and enums have exactly one definition. The apps import `@haala/design-tokens`
and `@haala/ui` so the design system + components are defined once.

> **pnpm note:** the repo uses `node-linker=hoisted` (`.npmrc`) — the
> Expo-recommended layout so Metro resolves modules reliably in a monorepo.

## Backend architecture

Strict **controller → service → repository** layering (the discipline NestJS
would give for free, imposed by convention here):

- **Controller** — HTTP only: read the request, call one service method, send
  the envelope. No business logic.
- **Service** — business rules, orchestration, transactions. Framework-agnostic.
- **Repository** — data access via Drizzle. Every method accepts an optional
  executor (`DB | Tx`) so the same code runs inside or outside a transaction.

Auth + Users is the fully-implemented reference vertical. Every other module
follows its shape.

### Modules

`auth` · `users` · `addresses` · `stores` · `catalog` · `inventory` · `cart` ·
`orders` · `payments` · `riders` · `delivery` · `promotions` · `notifications` ·
`analytics`

Implemented: **auth**, **users**, **payments** (abstraction + COD + stub), the
full **customer core** — **addresses**, **stores** (serviceability),
**catalog** (products + per-store inventory), **inventory** (+ reservation
helpers), **cart**, **orders** (transactional placement/cancel/status + live
timeline) — and **fulfilment**: **riders** (profile, availability, location) and
**delivery** (claim + workflow). Still scaffolded (return `501` with planned
endpoints): **promotions**, **notifications**, **analytics**.

### Fulfilment

A rider **pulls** work rather than being dispatched to it: once an order is
`packed` it enters a claimable pool, and any online rider with nothing in hand
can take it. The unique index on `delivery_assignments.order_id` is what
resolves two riders tapping at once — the loser gets a conflict.

Delivery status is the rider's only input; the customer-facing order status is
**derived** from it (`picked_up` → order `picked_up`, `en_route_to_customer` →
`out_for_delivery`, `completed` → `delivered`) and applied through
`orderService.updateStatus`, so inventory finalisation, COD capture and the
customer timeline can't drift from what the rider did. Transitions are gated by
`DELIVERY_STATUS_FLOW` in `@haala/shared`, the delivery-side twin of
`ORDER_STATUS_FLOW`.

Two rules worth knowing: a COD order **cannot** be completed until the cash is
recorded, and a rider **cannot** go offline mid-delivery. The rider's live
position is only exposed to the customer **after pickup** — before that it says
nothing useful and needlessly discloses their movements.

### Request lifecycle

```
requestId → helmet → cors → compression → pino-http → json (except webhooks)
  → /api/v1 (rate limit) → module router
      → [authenticate] → [authorize(role)] → [validate(zod)] → controller
          → service → repository → Postgres/Redis
  → errorHandler (uniform { ok:false, error } envelope)
```

All responses use the envelope from `@haala/shared`:
`{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.

### Auth flow

- Register/login issue a short-lived **access token** (15 min) + a **refresh
  token** (30 days).
- Each refresh token has a `jti` stored in Redis (`refresh:{userId}:{jti}`).
  Refreshing **consumes** the key (single-use rotation) and issues a new pair;
  a reused/expired token is rejected. Logout deletes the key.
- `authenticate` populates `req.auth = { userId, role }`; `authorize(...roles)`
  gates by role.

### Payments

`PaymentProvider` is the only seam checkout/order logic depends on:

```
createPayment · verifyPayment · handleWebhook · refundPayment · getPaymentStatus
```

- **COD** is fully functional (pending → paid when the rider collects).
- **Online** uses a **stub** provider today; swap in Safepay/JazzCash later by
  writing one class and registering it — no checkout/order changes.
- Payment creation is **idempotent** on an idempotency key. Webhooks use the
  raw request body for signature verification. Raw card data is never stored.

### Realtime

socket.io with a JWT handshake. Sockets auto-join a per-user room; clients
`order:subscribe` to receive `order:status_updated`, `delivery:status_updated`,
and `rider:location_updated` events. Services emit via `emitToUser` /
`emitToOrder`.

### Transactions (critical operations)

These MUST run inside `db.transaction(async (tx) => …)`, passing `tx` to every
repository call so they commit or roll back atomically:

- **Order creation** — reserve inventory, create order + items, create pending
  payment, write status history.
- **Order cancellation** — release reserved inventory, refund, status history.
- **Payment confirmation** — update payment + order status together.
- **Inventory reservation / release**.

## Data model

Money is stored as **integer paisa** everywhere (never floats); formatted only
at display via `formatPKR`. UUID primary keys; `snake_case` columns.

Core tables: `users`, `addresses`, `stores`, `categories`, `products`,
`inventory` (per-store stock with reserved qty), `carts`/`cart_items`,
`orders`/`order_items`/`order_status_history`, `payments`/`refunds`, `riders`,
`delivery_assignments`, `promotions`, `notifications`.

Order status flow (enforced in the Orders service):

```
placed → confirmed → preparing → packed → picked_up → out_for_delivery → delivered
        ↘ cancelled (pre-pickup)                     ↘ failed (post-pickup)
```

## Roadmap

**Phase 0 — Foundation (done)**
Monorepo, infra, backend skeleton, auth/users vertical, payments abstraction,
design tokens, app scaffolds.

**Phase 1 — Customer core (done)**
Backend: addresses, stores + serviceability, catalog + inventory read, cart,
order placement (transactional) with COD, cancel/refund, ops status lifecycle,
order tracking + realtime timeline.
App: `@haala/ui` component library + customer screens — auth, home, product
listing/detail, cart, checkout (address + payment + review), order
confirmation, live tracking, order history, profile, address management — wired
to the API with React Query + socket.io.

**Phase 2 — Rider + fulfilment (done)**
Backend: rider profile/availability/location, claimable-order pool, delivery
workflow, COD collection, live rider location over socket.io.
Rider app: Expo Router shell, sign-in, online/offline shift toggle, order queue,
step-by-step delivery run with navigation hand-off and COD capture, history.
Customer app: real courier on the tracking screen with a live map pin.

**Phase 3 — Growth (in progress)**
Done: **ops dashboard** (`apps/dashboard`) — order pipeline with pack-to-release,
rider roster + store assignment, per-store pricing/stock, staff accounts.
Remaining: promotions, notifications (push), analytics, online payment provider.

### Ops dashboard

Next.js App Router, reusing `@haala/shared` contracts (the palette is mirrored
as CSS custom properties; `@haala/ui` is React Native and does not apply).

Auth is deliberately **not** a bearer token in the browser. Login sets
**httpOnly cookies** and every API call is proxied through
`/api/haala/[...path]`, which attaches the token server-side. This dashboard can
change prices and mint staff accounts, so a token readable by injected script is
a materially worse risk than on the customer app — and proxying also removes CORS
from the picture. The route guard runs server-side and re-checks the admin role
rather than trusting the cookie's presence.

## Running locally

```bash
pnpm install
pnpm infra:up                 # Postgres + Redis via Docker
cp .env.example .env
pnpm --filter @haala/api db:push   # apply schema
pnpm --filter @haala/api db:seed   # optional dev data
pnpm build                    # build shared packages
pnpm dev:api                  # http://localhost:4000/api/v1 (GET /health)
# apps:  pnpm --filter @haala/customer start   |   --filter @haala/rider start
```
