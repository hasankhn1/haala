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
`analytics` · `brands` · `business-types` · `brand` · `uploads` · `home`

All implemented. **auth**, **users**, **payments** (abstraction, COD, a local
stub and Safepay), the full **customer core** — **addresses**, **stores**
(serviceability), **catalog** (products + per-store inventory), **inventory**
(+ reservation helpers), **cart**, **orders** (transactional placement/cancel/
status + live timeline) — **fulfilment**: **riders** (profile, availability,
location) and **delivery** (claim + workflow) — and **growth**: **promotions**,
**notifications** (inbox + Expo push), **analytics**.

**Multi-tenancy** (August 2026): **brands** (platform administration —
`/admin/*`, super-admin only), **business-types** (what kind of shop a brand is,
paired with a code registry), **brand** (a vendor's own catalogue —
`/brand/*`, tenant-scoped) and **uploads** (presigned R2 image uploads). See
[Multi-tenancy](#multi-tenancy) below.

**Marketplace** (September 2026): **home** (the editorial banners ops manages
for the customer home screen). The customer app's home is now a directory of
departments rather than a grocery catalogue — see
[The marketplace home](#the-marketplace-home).

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

### Promotions

Discounts are computed in exactly one place — `promotionService.quote()` —
called both by `POST /promotions/validate` for the cart preview and by
`placeOrder` for the actual charge, so what a customer is quoted cannot diverge
from what they are billed.

Quoting inside placement takes a row lock, so two simultaneous checkouts can't
both consume the last use of a limited code. Per-customer limits are enforced by
`promotion_redemptions` rows rather than the `usedCount` aggregate, because a
counter cannot express "one per customer"; cancelling an order releases the
redemption so a cancelled order doesn't burn someone's first-order offer.

`free_delivery` zeroes the delivery fee rather than adding a discount equal to
it, so a receipt reads "Delivery: Free" instead of implying a coupon.

### Notifications

`notificationService.create()` writes an inbox row, emits
`notification:created` over socket.io, and pushes to the user's devices via
Expo's HTTP API. It never throws — it is called alongside order transitions, and
a push failure must not surface as a failed delivery.

Which transitions notify is deliberate: `placed`, `confirmed` and `preparing`
are silent, because on a 15-minute promise they fire within seconds of each other
and three buzzes for one order teaches people to mute the app. `arrived` gets its
own push from the delivery side — it has no order-status equivalent and is the
moment that most needs one.

Riders are notified when an order reaches `packed`, scoped exactly as the
claimable pool is, so nobody is told about a pickup they can't take. Tokens Expo
reports as `DeviceNotRegistered` are deleted rather than retried forever.

### Payments

`PaymentProvider` is the only seam checkout/order logic depends on:

```
createPayment · verifyPayment · handleWebhook · refundPayment · getPaymentStatus
```

- **COD** is fully functional (pending → paid when the rider collects).
- **Online** is **Safepay**, implemented and registered. Which one runs is
  `PAYMENT_ONLINE_PROVIDER`: `stub` locally, `safepay` where real credentials
  exist. Adding JazzCash or Easypaisa is one class and one `register()` call —
  checkout and orders are untouched.
- Safepay quotes in **decimal rupees** while everything here is integer paisa.
  That conversion is the highest-consequence arithmetic in the codebase and has
  its own tests (`providers/safepay.money.test.ts`).
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

## The marketplace home

"Haala is the brand. Grocery is a department." The customer app's home lists
departments; the grocery catalogue it used to be moved wholesale to
`src/screens/DepartmentScreen.tsx`, which now takes a business-type key and
scopes everything to it.

**A department is data, not a screen.** `/catalog/departments` returns every
active `business_types` row with an `isLive` flag that asks the same question
the catalogue asks — is there stock — so a department goes live by receiving
inventory and nothing is deployed. Colour comes from `departmentTints`, copy
from `departmentCopy` in `@haala/shared`, and both fall back safely for a type
the apps have not been taught yet.

**One request feeds the screen.** `GET /catalog/home` returns departments,
banners, popular categories and popular products together; it previously made
three and settled in three separate jerks.

**Scoping.** `/catalog/products` and `/catalog/categories` both take an optional
`department`. Absent, they answer across the whole marketplace, which is what
the Categories tab and search want. Present, they answer for one shop —
including the paginated `total`, whose count query has to repeat the join or it
reports the whole catalogue under one department's heading.

`ProductView` carries `departmentKey`, from the product's brand's business type.
The home grid needs it to label a card and, in a department's own grid, to size
its image.

### Caching

`common/cache.ts` is a read-through wrapper over the existing Redis client.
`GET /catalog/home` uses it with a 5-minute TTL, keyed by store — price is a
per-store override and stock is per-store outright, so a shared key would serve
one dark store's shelf to a shopper standing beside another. The `storeId` is
validated to a uuid *before* it reaches the key, because it becomes part of the
key: unchecked, anyone could mint unlimited entries from the public endpoint.

**It fails open, in two senses, and the second is easy to miss.** Redis errors
are swallowed and the request computes fresh. But ioredis also *queues* commands
while disconnected and retries with a growing backoff — with Redis stopped the
endpoint kept answering 200 with correct data in 1.2s, then 4.5s, then 7.8s.
Correct and unusable. Every Redis call here is bounded at 150ms, which turns
that into a flat ~320ms that recovers on its own.

Banner and business-type writes invalidate `cache:home:*` explicitly, so the
dashboard feels immediate rather than eventually-correct. `SCAN`, not `KEYS` —
the same Redis holds refresh tokens, and a blocking `KEYS` would stall sign-ins.

**Nothing per-customer may go in there.** The payload is shared by everyone near
a store. "Buy it again" (`GET /orders/recently-ordered`) is a separate
authenticated request for exactly that reason, and prices from the catalogue
rather than the receipt — the seed has an item bought at PKR 2,200 that now
sells for 1,870, and a card showing the old price would be a lie the customer
finds at checkout.

### Homepage CMS

`home_banners` is the one part of the home screen ops could not previously
manage. Departments and brands already had on/off switches where they are
defined, so the dashboard's **Homepage** page adds only banners and links across
to the other two rather than duplicating them.

`department_key` is plain text, not a foreign key: retiring a department should
retire its promo, not delete the artwork. A banner whose department is not live
is withheld from the app instead, and the dashboard row says so — checking the
same `isLive` the API checks, not merely whether the department is offered.

The column holds an **object key**, not a URL, so moving buckets or putting a
CDN in front costs nothing.

## Data model


Money is stored as **integer paisa** everywhere (never floats); formatted only
at display via `formatPKR`. The delivery-fee rule lives once, in
`@haala/shared`'s `pricing.ts`, imported by the API, the customer app and promo
quoting — it used to be duplicated, which is one edit away from quoting a total
we don't charge. UUID primary keys; `snake_case` columns.

Core tables: `users`, `addresses`, `stores`, `categories`, `products`,
`product_variants` (the sellable sizes — inventory and baskets count these, not
products), `inventory` (per-store stock with reserved qty), `carts`/`cart_items`,
`orders`/`order_items`/`order_status_history`, `payments`/`refunds`, `riders`,
`delivery_assignments`, `promotions`, `notifications`, `home_banners`.

### Baskets are per department

`carts` carries `department_key` and is unique on `(user_id, department_key)`,
replacing one basket per customer. Somebody buying rice and a shirt holds two,
and they check out separately: an order is picked and dispatched from one shop,
so a single order spanning a dark store and a boutique is not a thing that can
be fulfilled. `POST /orders` therefore names a department.

**Which basket something lands in is derived from the product's brand,
server-side.** There is no request field for it — accepting one would let a
caller put a shirt in the grocery basket, and the split rests on that not being
possible. A guest device holds one flat list with no notion of departments, so
`POST /cart/merge` fans out across baskets and each stored line carries its
department so the device groups the way the server does.

`GET /cart` answers with **every** basket. The Cart tab's switcher needs each
count to draw itself, and fetching per department would let the tabs disagree
with the basket beneath them.

**A basket untouched for `CART_TTL_DAYS` (7) is emptied on the next read.**
Prices and stock move; an eight-day-old basket restored at checkout, priced as
it was, is a worse surprise than an empty one. The sweep runs on the read path
because there is no scheduler in this deployment and a basket only matters when
somebody looks at it. Note that editing a line writes `cart_items.updated_at`
and says nothing about the basket, so `carts.updated_at` is touched explicitly —
without it, a basket in daily use would still be swept on day eight.

Tenancy tables: `brands` and `business_types`. `categories` and `products` each
carry a NOT NULL `brand_id`, and their slug uniqueness is **composite** —
`(brand_id, slug)` — because two bakeries both wanting `cakes` is the normal
case rather than a conflict. `users.brand_id` is set for, and only for, a
`brand_user`:

```sql
users_brand_role_ck  CHECK ((role = 'brand_user') = (brand_id IS NOT NULL))
```

Roles: `customer` · `rider` · `admin` · `super_admin` · `brand_user`. The first
two are the apps; `admin` and `super_admin` are Haala staff (`HAALA_STAFF_ROLES`
in `@haala/shared`), with `super_admin` additionally managing brands.

`products` also carries `compare_at_price` (the struck-through "was" price —
never what is charged), `images` (an ordered gallery, with `image_url` as a
derived cover) and `attributes` (jsonb, validated per business type).

Exactly one variant per product sits at `sort_order = 0`, guaranteed by
`product_variants_default_uq`. The catalogue joins on that row to resolve the
price a card shows, so a product without one still exists and quietly stops
being buyable.

### Delivery areas

`stores.polygon` holds an optional drawn shape (a jsonb list of `{lat,lng}`).
`isWithinDeliveryArea` in `common/geo.ts` — the single definition of "we deliver
here", used by both `GET /stores` and `placeOrder` — prefers it and falls back
to `delivery_radius_meters` when there are fewer than three points, which is not
a shape. Shape validation lives in `@haala/shared`'s `store-polygon.ts`, so the
dashboard's editor and the API agree on what a usable polygon is.

A circle is a poor fit for DHA Peshawar's blocks, which is why the function is
named for the *area* rather than the radius. Ops draws the shape on the Stores
page, and `placeOrder` re-checks it rather than trusting the basket — a basket
can be filled before the customer switches to an address somewhere else.

Order status flow (enforced in the Orders service):

```
placed → confirmed → preparing → packed → picked_up → out_for_delivery → delivered
        ↘ cancelled (pre-pickup)                     ↘ failed (post-pickup)
```

## Multi-tenancy

A **brand** owns product *definitions*; Haala owns *stock*. Home businesses do
not fulfil their own orders — their goods sit in Haala's dark stores — so a
vendor controls what a thing is and whether it is on sale, while ops controls
how many are on the shelf. `stores`, `inventory`, delivery and the order
pipeline were unchanged by the multi-tenant work.

Isolation is enforced at three levels, and only the third proves anything:

1. **Types** — every function in `modules/brand/catalog.repository.ts` takes
   `brandId` as its required first parameter. No overload omits it, so
   forgetting the tenant is a compile error rather than a cross-tenant query.
2. **Runtime** — `common/middleware/brand-scope.ts` resolves the tenant from the
   verified access token. For a `brand_user` no request field is consulted;
   Haala staff must name a brand explicitly with `?brandId=`.
3. **Tests** — `modules/brand/isolation.test.ts` points brand A at every one of
   brand B's ids across every route. Typecheck and a clean build pass whether or
   not isolation holds.

**Cross-tenant access answers 404, never 403** — a 403 confirms the row exists,
which is enough to enumerate a competitor's catalogue by id.

Customer-facing queries in `modules/catalog` join `brands` and require
`status = 'active'`, including the lookup the cart makes before accepting an
item. Suspension therefore removes a shop from listings, search, product pages
and baskets, while leaving its catalogue intact.

### Business types

A brand's type decides what its product form asks for. The `business_types` row
carries identity and an on/off switch the super admin controls at runtime; the
**field definitions live in `packages/shared/src/business-types.ts`** so they
can be validated with zod and rendered as a typed form from one definition. The
API validates `products.attributes` against the same entry the dashboard draws
its inputs from.

## Uploads

`modules/uploads`, backed by Cloudflare R2.

`POST /uploads/sign` returns a presigned PUT so the browser uploads **directly
to Cloudflare** — a vendor's 6MB phone photo never crosses the API. The client
downscales to 1600px first. `POST /uploads/confirm` then HEADs the object: a
presigned PUT can pin content-type but not size, so without that check the 5MB
limit would be a claim rather than a rule.

Keys are `brands/<brandId>/<kind>/<uuid>.<ext>`, and `confirm` re-derives the
prefix from the caller's own brand rather than trusting it.

Homepage banner artwork uses a second prefix, `home/`, signed by
`POST /admin/banners/uploads/{sign,confirm}` rather than by `/uploads/*`. That
router runs `brandScope`, which resolves a tenant, and a platform asset has
none — inventing a brand id to hang it off would put it inside a shop's
namespace, where that shop's own users would pass the prefix check and be able
to overwrite it. Under `/admin` the super-admin gate is the whole authorization
story.

`R2_PUBLIC_BASE_URL` is optional and separate from the credentials, because the
two are switched on independently. Set, images are addressed at Cloudflare's
edge; unset, they are served through `GET /media/<key>` — slower, but uploads
work the moment the bucket exists.

## Dashboard

One Next.js host, two shells, guarded server-side by role:

- `app/(dash)/*` — Haala staff. Orders, riders, catalogue, promotions, stores,
  staff, plus **brands**, **shop logins**, **business types** and **homepage**
  (the customer home's promo banners).
- `app/brand/*` — one vendor. Their products, categories and shop details, and
  nothing of anyone else's.

`app/page.tsx` routes by role. Someone in the wrong shell is sent to `/`, not to
`/login` — showing a sign-in form to a person who is already signed in helps
nobody.

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

**Phase 3 — Growth (done)**
**Ops dashboard** (`apps/dashboard`) — analytics home, order pipeline with
pack-to-release, rider roster + store assignment, per-store pricing/stock, promo
codes, staff accounts.
**Promotions** — percentage / fixed / free-delivery codes with usage and
per-customer limits, quoted in the cart and re-priced at placement.
**Notifications** — inbox + Expo push to both apps, on customer-visible order
transitions and to riders when an order becomes claimable.
**Analytics** — `/analytics/overview`: volume, money, the two fulfilment timings,
live pipeline, top products, rider and store breakdowns, promo usage.
**Online payments** — Safepay behind the existing `PaymentProvider` seam.

**Phase 4 — Marketplace (done, September 2026)**
Clothing seeded and live, so `isLive` is exercised by two departments rather
than asserted about one. The customer home rebuilt to `Haala Home.dc.html` — a
department rail, an "All N" sheet, category chips, a promo row and a
cross-department grid — fed by a single cached `GET /catalog/home`. Department
screens scoped to their own catalogue, tinted with their own colour and given a
way back. Baskets split per department with a 7-day life. "Buy it again" from
real order history. A **Homepage** CMS in the dashboard for the promo banners.

**Deployment** — see [DEPLOYMENT.md](DEPLOYMENT.md). The API deploys to Railway
from `apps/api/Dockerfile`; migrations run as a pre-deploy step from generated
SQL, never `db:push`. `production` is the default branch and Railway deploys
from it, so a push is a deploy.

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
pnpm infra:up                 # Postgres :5433 + Redis :6380 via Docker
cp .env.example .env
pnpm db:migrate               # apply the generated SQL
pnpm --filter @haala/api db:seed   # dev data — never against production
pnpm build                    # build shared packages
pnpm dev:api                  # http://localhost:4000/api/v1 (GET /health)
pnpm test                     # 178 API + 32 shared, node:test via tsx
# apps:  pnpm --filter @haala/customer start   |   --filter @haala/rider start
# dashboard: pnpm --filter @haala/dashboard dev   (http://localhost:3000)
```

**Production runs generated migrations only** — `db:push` infers changes and
will drop a column against real data, so it is local-only. After a schema
change, run `pnpm --filter @haala/api db:generate` and commit the SQL.

Two migration notes worth having before you need them. Drizzle runs every
pending migration in **one transaction**, so `ALTER TYPE … ADD VALUE` followed
by a use of that value fails; recreate the type instead. And when two branches
both generate `00NN`, the one already on `origin/production` keeps the number —
delete yours, regenerate on top of theirs, and restore the descriptive filename
and journal tag. The snapshots are a chained diff and must not be renumbered by
hand. `0014_cart_per_department.sql` is a worked example of expand → backfill →
contract, including splitting rows that the new uniqueness rule would reject.

Deployment: [DEPLOYMENT.md](DEPLOYMENT.md).
