# Haala — start here

You are joining a quick-commerce grocery platform for **DHA Peshawar,
Pakistan**. A customer orders from a phone, a picker packs it at a dark store,
a rider delivers it, and money is in **Pakistani rupees**.

As of August 2026 it is also a **marketplace**: alongside Haala's own grocery
catalogue, home businesses — a bakery, a clothing boutique, frozen food,
produce, gifts — each get their own login and dashboard for their own products.

This document is the context that is not obvious from the code. Read it once.
`CLAUDE.md` is the short list of things that are easy to get wrong; keep that
one to hand.

---

## Who it is for

This matters, because it decides product arguments.

A poll in a DHA Peshawar residents' group came back **55 / 15 / 2** in favour of
the problem being real. Two things followed from it:

- **The launch offer is free delivery, not a discount.** Discounting signals a
  cheap shop; free delivery removes the specific friction people named.
- **Bulk buyers are not the market.** The objection "I buy monthly from the
  wholesale market" is correct and not worth designing against. The market is
  the top-up shop: the thing you forgot, needed in half an hour.

The residents' group itself is **not a sales channel** — the admin has already
intervened once. Do not plan growth that depends on posting there.

---

## The stack, and why

Each of these was argued once. The reasons are here so they are not re-opened.

| Choice | Why |
| --- | --- |
| **Express + TypeScript** | Chosen over NestJS. Strict `controller → service → repository` by convention rather than by framework |
| **Drizzle ORM** on Postgres 16 | SQL you can read, migrations you can review as SQL |
| **Redis 7** | Refresh-token rotation, rate limits |
| **React Native + Expo** (Expo Router) | Two apps, customer and rider, from one toolchain |
| **Next.js App Router** for the dashboard | Server-side auth guards, httpOnly cookies, no bearer token in browser JS |
| **pnpm + Turborepo**, `node-linker=hoisted` | Metro needs a flat `node_modules` |
| **Railway** | Chosen over a Hetzner/DO VPS — fastest to a live HTTPS URL, no server administration |
| **Cloudflare R2** | Image uploads. S3-compatible, no egress fees |
| **`node:test` via tsx** | Deliberately no Jest or Vitest dependency |
| **Safepay** | Chosen over JazzCash/Easypaisa: self-serve sandbox, no merchant onboarding needed to build against. COD is live; online stays on `stub` until real credentials exist |

**Money is integer paisa everywhere.** Safepay takes decimal rupees, and that
conversion is the highest-consequence arithmetic in the codebase.

### Layout

```
apps/
  api          Express API           :4000   /api/v1
  customer     Expo (React Native)
  rider        Expo (React Native)
  dashboard    Next.js               :3000
packages/
  shared         zod contracts, pricing, enums — the API/app boundary
  design-tokens  the Basket design system
  ui             shared React Native components
```

`packages/design-tokens` and `packages/ui` export source directly, no build
step. `@haala/shared` builds to `dist` — rebuild it after editing a contract:
`pnpm --filter @haala/shared build`.

---

## Your first thirty minutes

```bash
pnpm install
pnpm infra:up                        # Postgres :5433, Redis :6380
pnpm db:migrate
pnpm --filter @haala/api db:seed
pnpm dev:api                         # :4000, health at /health
pnpm --filter @haala/dashboard dev   # :3000
```

**The ports are not the defaults.** Homebrew Postgres and Redis hold 5432/6379
on the machine this was built on, so the containers publish on **5433** and
**6380**. A `role haala does not exist` error means your client is talking to
the wrong one.

### Sign in

Seeded accounts, local only — password `haala1234`:

| Phone | Role | Lands on |
| --- | --- | --- |
| `+923009990000` | `super_admin` | `/orders` — the ops dashboard |
| `+923001112233` | `customer` | the customer app |
| `+923004445566` | `rider` | the rider app |

**The seed creates no brand user** — a shop login is issued deliberately, not
conjured. Make one: sidebar → **Shop logins** → pick a shop, fill in three
fields. The password is shown once, because it is stored as a bcrypt hash and
there is nothing to read back afterwards.

Sign in as that account and you land on `/brand` — a different dashboard, same
host, showing only that shop.

---

## Multi-tenancy, in plain terms

**A brand owns product definitions. Haala owns stock.**

Home businesses do not fulfil their own orders; their goods sit in Haala's dark
stores. So a vendor controls what a thing *is* — name, photos, price, sizes,
whether it is on sale at all — and Haala's ops team controls how many are on
the shelf. The vendor dashboard shows the count read-only, and the API rejects
a write to it. That split is deliberate and comes up in most conversations
about the feature.

**Isolation is enforced three times over**, and only the third one proves
anything:

1. **Types.** Every function in `catalog.repository.ts` takes `brandId` as its
   required first parameter. Forgetting it is a compile error.
2. **Runtime.** `brandScope` resolves the tenant from the verified access token.
   For a `brand_user` no request field is consulted at all — a `brandId` in the
   body is not rejected so much as never read.
3. **Tests.** `apps/api/src/modules/brand/isolation.test.ts` points brand A at
   every one of brand B's ids across every route. Typecheck and a clean build
   pass whether or not isolation holds; these are what distinguish the two.

**Cross-tenant access answers 404, never 403.** A 403 confirms the row exists,
which is enough to enumerate a competitor's catalogue by id.

The database backs this up: `users_brand_role_ck` makes a brand login without a
brand — or any other role carrying one — unrepresentable.

### Roles

`customer` · `rider` · `admin` · `super_admin` · `brand_user`

`admin` and `super_admin` are both Haala staff (`HAALA_STAFF_ROLES`);
`super_admin` additionally manages brands and business types. `admin` was kept
rather than renamed so existing sessions and routes carried on working.

### Business types

A brand has a type — bakery, clothing, produce — and that type decides what its
product form asks for. A boutique is asked for suit type, pieces, fabric and
what is included; a baker for allergens, shelf life and whether it is baked to
order.

Those field sets live in **`packages/shared/src/business-types.ts`**, and both
sides use the same entry: the API validates `products.attributes` against its
zod schema, the dashboard renders the form from its field list. They cannot
disagree.

Adding a type is one entry there plus one `business_types` row. It needs a
deploy — that is the deliberate trade for a product form that is type-checked
rather than a JSON blob interpreted at runtime.

---

## The design pipeline

**No engineer will guess this one.** The UI does not come from Figma.

The source of truth is a **Claude Design** file, `Grocery App.dc.html`, in the
project *Grocery App Design System*, pulled with the **DesignSync** tool. The
design system it defines is called **Basket**: ember `#FF5A1F` on a white
canvas, warm near-black type `#191410`, Plus Jakarta Sans, heavy radii,
extrabold headings.

Three rules, each learned the hard way:

**Re-fetch it every time.** A cached copy was read for four rounds of work and
had gone a whole screen out of date — an entire set-location screen existed
that nobody knew about. If Hassan says a screen exists and your copy disagrees,
your copy is stale.

**`#EDE7E0` is not a background colour.** It appears exactly once in the file,
in the `<helmet>` block that styles the design document's own page — it is the
ground *behind the phone frame*. Theming the app canvas with it tinted every
screen and made every white card invisible. The app shell is `#fff`. More
generally, `<helmet>` and body styles describe the canvas a mockup sits on, not
the product.

**The surface ladder is:** canvas `#FFFFFF` → `surfaceSunken` `#F7F3EF` (wells
holding imagery) → `surfaceMuted` `#F1EBE4` (tiles, steppers) → ember washes →
`border` `#EDE5DE` hairline → `accent` `#26211E` contrast panel. **Cards are
hairline-bounded, not filled** — a white panel on white is nothing.

Full spec: `packages/design-tokens/DESIGN.md`. Read it before changing a token.

Components must consume `theme.colors.*` and never `theme.palette.*`. Basket is
the third brand this app has worn, and the re-theme was nearly free precisely
because every semantic token kept its name and only its value moved.

---

## How we work with Claude on this repo

Much of this codebase was written with Claude Code. Honest inventory, so nobody
chases tooling that is not actually in play.

**In active use:**

- **Claude Design + DesignSync** — the UI source of truth, as above.
- **Stitch MCP** (Google, UI generation) — **via raw `curl`, not the MCP tools.**
  The tools never load in Claude Code (`can't resolve reference
  #/$defs/ScreenInstance`), which is a JSON-Schema resolver problem on the
  client, not a broken server. It is a stateless HTTP server: `initialize`, then
  `tools/list`, then `tools/call`. The API key lives in
  `.claude/settings.local.json`, which is gitignored.
- **`security-guidance` plugin** — hooks only, no skills. It runs in the
  background.
- **Plan mode** for anything structural. The multi-tenant work was planned,
  argued and then built in six phases; the plan caught two Postgres traps before
  they reached production.
- **Project memory** — durable facts persist across sessions. The rule of thumb:
  if a fact would help *anyone* on the team, it belongs in this repo, not in
  memory.

**Installed but not used here:**

- The **`figma` plugin** and its four skills (`figma-design-to-code`,
  `figma-generate-design`, `figma-code-connect`, `figma-create-new-file`).
  There is no Figma file for Haala. Ignore them unless that changes.

**Nothing in `.claude/skills/`.** The repeatable workflows — the migration
drill, the EAS build, the design re-fetch — are documented here rather than
packaged as skills. Turning them into skills is a reasonable next step.

---

## Migrations

Expand → backfill → contract, in separate files. Two Postgres facts make this
non-negotiable, and both were found by generating a migration and reading it
before running it:

- **Drizzle runs every pending migration inside one transaction.** So
  `ALTER TYPE … ADD VALUE` followed by a use of that value fails —
  "unsafe use of new value". Recreate the type instead (rename → create → cast →
  drop). Splitting into separate files does *not* help.
- **`ADD COLUMN … NOT NULL` fails on a table that already has rows.** Add it
  nullable, backfill, then `SET NOT NULL`.

`drizzle-kit generate` will happily emit both of those. Read what it writes.

`db:push` is **local only** — it infers changes and will drop a column against
real data. Production applies the generated SQL as a Railway *pre-deploy* step,
not on container boot, which would race itself when scaled past one instance.

Migration `0006`–`0008` are the multi-tenant rollout and are worth reading as a
worked example.

---

## Mobile builds

```bash
cd apps/customer && npx eas-cli@latest build -p android --profile preview
```

**EAS, not a local Gradle APK** — only an EAS build mints the
`extra.eas.projectId` that Expo push notifications need. Without it
`getExpoPushToken()` returns `null`, silently, and no notification ever arrives.

Profiles are in `apps/<app>/eas.json`: `preview` is a sideloadable APK,
`production` an app bundle. There is no `development` profile because neither
app has `expo-dev-client`, and no `expo-updates` — so **every JS change needs a
new build** to reach a phone.

Two more, from `CLAUDE.md` but worth the context here:

- **Expo Go is dead** on the one available emulator (Android 16 / API 36):
  it installs but Android reports no launchable activity. Use a dev build.
- **Maps never work in Expo Go** regardless — it ships its own Maps key and
  never reads `app.config.js`. Judge maps only from a dev build or the APK.

---

## Left out on purpose

These appear in the design comps and are **not** implemented, because no
backend supports them. They are decisions, not oversights:

- Service fee and tipping — the bill lines exist and compute, the charge is a
  pricing decision nobody has made
- Basket Plus / subscription
- OTP auth — the comps show phone + OTP; the API is phone + password
- The customer app still shows **one image per product**, though products now
  carry a gallery. The data is there; the carousel is not built

The comps are also priced in Bahraini dinar and name Dubai hubs. Money goes
through `formatPKR`; store names come from the `stores` table.

---

## Where to look next

| Doc | For |
| --- | --- |
| `CLAUDE.md` | The short list of things that are easy to get wrong |
| `ARCHITECTURE.md` | Module map, data model, request lifecycle, multi-tenancy |
| `DEPLOYMENT.md` | Railway, environment variables, production migrations |
| `packages/design-tokens/DESIGN.md` | The Basket design system |
