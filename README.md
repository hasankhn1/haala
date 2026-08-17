# Haala

Quick-commerce grocery delivery — customer app, rider app, and backend.

A pnpm + Turborepo monorepo:

- **`apps/api`** — Node.js + Express + TypeScript backend (Postgres + Redis, socket.io)
- **`apps/customer`** — React Native (Expo) customer app
- **`apps/rider`** — React Native (Expo) rider app
- **`packages/shared`** — domain types + zod API contracts
- **`packages/design-tokens`** — the design system tokens

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design.

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

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | Run the API in watch mode |
| `pnpm build` | Build all packages + api |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm infra:up` / `infra:down` | Start/stop Postgres + Redis |
| `pnpm --filter @haala/api db:studio` | Drizzle Studio (browse the DB) |
| `pnpm --filter @haala/customer start` | Run the customer app |
| `pnpm --filter @haala/rider start` | Run the rider app |
