# Haala

Quick-commerce grocery delivery for DHA Peshawar — customer app, rider app, and
backend. Also a marketplace: home businesses each get their own login and
dashboard for their own catalogue.

A pnpm + Turborepo monorepo:

- **`apps/api`** — Node.js + Express + TypeScript backend (Postgres + Redis, socket.io)
- **`apps/customer`** — React Native (Expo) customer app
- **`apps/rider`** — React Native (Expo) rider app
- **`apps/dashboard`** — Next.js dashboard: Haala ops (orders, riders, pricing,
  promos, brands) and a separate vendor shell for shop owners
- **`packages/shared`** — domain types + zod API contracts
- **`packages/design-tokens`** — the design system tokens
- **`packages/ui`** — shared React Native component library

**New here? Read [ONBOARDING.md](./ONBOARDING.md) first** — what Haala is, why
the stack is what it is, and the handful of things that are not obvious from the
code (the design comes from a Claude Design file, not Figma; the local Postgres
port is 5433, not 5432).

| Doc | For |
| --- | --- |
| [ONBOARDING.md](./ONBOARDING.md) | Joining the project |
| [CLAUDE.md](./CLAUDE.md) | Conventions, invariants and traps — kept short on purpose |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module map, data model, multi-tenancy |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Shipping it to Railway |

## Quick start

```bash
pnpm install
pnpm infra:up                        # Postgres + Redis (Docker)
cp .env.example .env
pnpm build                           # build shared packages
pnpm --filter @haala/api db:push     # create schema
pnpm --filter @haala/api db:seed     # optional dev data
pnpm dev:api                         # API on http://localhost:4000
```

Health check: `curl http://localhost:4000/health`

`db:push` is the local workflow. Production applies **generated migrations**
only — `push` infers changes and will drop a column against real data.

## Common commands

> **Android emulator:** run `pnpm android:reverse` after the emulator starts.
> Both apps read `EXPO_PUBLIC_API_URL=http://localhost:4000`, and inside the
> emulator that is the emulator's own loopback unless adb forwards it. The
> tunnel does **not** survive an emulator or adb restart — an empty
> `adb reverse --list` is the tell when sign-in or the API suddenly stops
> working. (`10.0.2.2` would need no tunnel, but pinning it in `.env` breaks
> the web build, which cannot resolve that address.)

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | Run the API in watch mode |
| `pnpm build` | Build all packages + api |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm test` | Run the test suite (money conversion, promo pricing guards) |
| `pnpm infra:up` / `infra:down` | Start/stop Postgres + Redis |
| `pnpm --filter @haala/api db:studio` | Drizzle Studio (browse the DB) |
| `pnpm --filter @haala/customer start` | Run the customer app |
| `pnpm --filter @haala/rider start` | Run the rider app |
| `pnpm --filter @haala/dashboard dev` | Run the ops dashboard on :3000 |
| `pnpm --filter @haala/api db:generate` | Generate a migration after a schema change |
