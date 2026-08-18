# Deploying haala

The API deploys to **Railway** from `apps/api/Dockerfile`. The mobile apps ship
as builds pointed at the deployed API; the dashboard deploys as a second
service.

Everything below has been verified locally against the actual container image —
see "What was verified" at the end.

## 1. Railway services

Create a project with three services:

| Service | Source | Notes |
| --- | --- | --- |
| **api** | this repo, `apps/api/Dockerfile` | `railway.json` sets the builder, healthcheck and pre-deploy step |
| **Postgres** | Railway plugin | injects `DATABASE_URL` |
| **Redis** | Railway plugin | injects `REDIS_URL` |

`PORT` is injected by Railway and already read by the env schema, so leave it
unset.

## 2. Environment variables

Set these on the **api** service. Everything not listed has a working default.

```
NODE_ENV=production
JWT_ACCESS_SECRET=<fresh 32+ random chars>
JWT_REFRESH_SECRET=<a different fresh 32+ random chars>
CORS_ORIGINS=https://<dashboard-domain>
```

Generate the secrets rather than reusing the local ones:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Online payments, once you have Safepay credentials:

```
PAYMENT_ONLINE_PROVIDER=safepay
SAFEPAY_API_KEY=...
SAFEPAY_SECRET_KEY=...
SAFEPAY_WEBHOOK_SECRET=...            # must match the Safepay dashboard
SAFEPAY_BASE_URL=https://api.getsafepay.com
SAFEPAY_ENVIRONMENT=production
```

Leave `PAYMENT_ONLINE_PROVIDER=stub` until those are real. The Safepay provider
throws on first use if selected without credentials — deliberately loud, rather
than silently taking payments nowhere.

Point Safepay's webhook at:

```
https://<api-domain>/api/v1/payments/webhooks/safepay
```

## 3. Migrations

`railway.json` runs migrations as a **pre-deploy** step:

```
node apps/api/dist/db/migrate.js
```

Pre-deploy rather than on container boot, because a container that migrates when
it starts races itself the moment there is more than one instance. The script
exits non-zero on failure so a bad migration halts the deploy instead of
starting an API against a schema it doesn't match.

`db:push` is for local development only — it infers changes and will drop a
column against real data. Production only ever runs generated migrations from
`apps/api/drizzle/`.

After a schema change:

```bash
pnpm --filter @haala/api db:generate   # commit the generated SQL
```

### One-time: seeding

```bash
railway run --service api pnpm --filter @haala/api db:seed
```

The seed is idempotent (upserts on natural keys) and does **not** reset
`usedCount` on promotions, so re-running it won't wipe real redemptions.

## 4. Apps

Set the API origin at build time. `API_BASE` appends `/api/v1` itself, so this
is the bare origin:

```bash
EXPO_PUBLIC_API_URL=https://<api-domain> npx eas build -p android --profile production
```

An HTTPS origin also removes the two things that made release builds unusable:
no `adb reverse` tunnel, and no need for a cleartext-traffic exemption (which
only ever existed in the debug manifest).

## 5. Dashboard

Deploy `apps/dashboard` as its own service (or to Vercel) with:

```
HAALA_API_URL=https://<api-domain>/api/v1
SESSION_SECRET=<fresh random>
```

Then add its origin to the API's `CORS_ORIGINS`. Note the dashboard proxies
every API call server-side, so CORS matters less here than it would with a
browser-side token — but keep it tight anyway.

## What was verified locally

- `.dockerignore` cuts the build context from **3.2 GB to ~7 MB** (it previously
  would have shipped `node_modules` and 1.9 GB of generated Android projects).
- The image builds and boots as a **non-root** user, reaching Postgres and Redis.
- **433 MB** image. It was 1.4 GB until the build switched to
  `node-linker=isolated`: the repo's `.npmrc` sets `hoisted` for Metro's sake,
  and hoisted linking flattens the *entire* lockfile while ignoring `--filter`,
  so Next.js, React Native, Expo and the Android toolchain were all being copied
  into a server image that never loads them.
- The generated migration produces a schema **identical** to the working
  database — same tables, columns, types, nullability and indexes — confirmed by
  diffing `information_schema` between a freshly-migrated database and the
  existing one.
- Migrations are idempotent: running the compiled script twice is a no-op, and it
  exits `1` on failure.
- A full order lifecycle runs against the **container**: register → browse →
  cart → promo validate → place with `HAALA100` → ops pack → notification →
  analytics → static images.

Two bugs were found by testing the container rather than the dev server, and are
fixed:

1. **Static product images 404'd in the container.** `app.ts` resolved `public`
   from `process.cwd()`, which is `apps/api` under `pnpm dev` but the repo root
   in the image. All 81 images were present at a path the server never looked
   in — a Peshawar demo would have launched with an empty product grid. Now
   resolved from `__dirname`, correct in both.
2. **`packages/shared` had no `@types/node`.** It was silently borrowing them
   from the hoisted root, so the isolated build failed. Added explicitly, and
   test files are now excluded from `dist`.
