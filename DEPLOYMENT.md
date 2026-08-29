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

Seed **inside** the container, using the compiled script:

```bash
railway ssh --service api
node apps/api/dist/db/seed.js
```

Not `railway run … db:seed`. `railway run` injects Railway's variables but runs
the command on **your machine**, and `DATABASE_URL` points at
`postgres.railway.internal`, which only resolves inside Railway's network — so
it fails on DNS. (`db:seed` also runs through `tsx`, which the production image
prunes; `dist/db/seed.js` is the compiled equivalent and needs nothing extra.)
If you do want to seed from your Mac, use the Postgres service's
`DATABASE_PUBLIC_URL` — the TCP-proxy address — rather than the internal one.

The seed is idempotent (upserts on natural keys) and does **not** reset
`usedCount` on promotions, so re-running it won't wipe real redemptions.

## 4. Apps

Builds come from `apps/<app>/eas.json`. Both apps ship two profiles: `preview`
(internal-distribution **APK**, the one to sideload onto a phone) and
`production` (**app-bundle** for Play). Neither app has `expo-dev-client` or
`expo-updates`, so there is deliberately no `development` profile and no OTA
channel — a new build is the only way to ship a change.

The API origin lives in each profile's `env` block, and must be edited from
`https://REPLACE-WITH-RAILWAY-DOMAIN` to the real Railway domain before
building. `API_BASE` appends `/api/v1` itself, so this is the **bare origin**.

```bash
cd apps/customer
npx eas-cli@latest build -p android --profile preview
```

**Do not** pass the origin as a shell variable — `EXPO_PUBLIC_API_URL=… eas
build` only sets it on your Mac, and the build runs on Expo's servers, so the
variable never arrives. `apps/customer/.env` doesn't reach the builder either:
it is gitignored, and EAS uploads by `.gitignore`. Both failures are silent —
`config.ts` falls back to `http://localhost:4000`, so you get an APK that
installs, opens, and cannot sign in. `eas.json` `env` (or `eas env:create`) is
the only mechanism that survives the trip.

An HTTPS origin also removes the two things that made release builds unusable:
no `adb reverse` tunnel, and no need for a cleartext-traffic exemption (which
only ever existed in the debug manifest).

### Push notifications need the EAS project id

`getExpoPushToken()` reads `expoConfig.extra.eas.projectId` and returns `null`
without it — permission is requested, no token is registered, and no push ever
arrives. `eas init` writes that id into `app.json`; until it has run, the
notification inbox works but push does not. This is why the pilot build should
be an EAS build rather than a local Gradle APK.

### The tracking map needs a Google Maps key

`react-native-maps` on Android renders **grey tiles with no map** unless
`android.config.googleMaps.apiKey` is set in `apps/customer/app.json`. It is
currently unset, and it affects only the order-tracking screen. Get a key from
the Google Cloud console with the *Maps SDK for Android* enabled, then add:

```json
"android": {
  "package": "com.haala.customer",
  "config": { "googleMaps": { "apiKey": "AIza..." } }
}
```

## 5. Dashboard

Deploy `apps/dashboard` as its own service (or to Vercel) with **one** variable:

```
HAALA_API_URL=https://<api-domain>
```

**Bare origin, no `/api/v1`.** `src/lib/session.ts` builds
``API_BASE = `${HAALA_API_URL ?? 'http://localhost:4000'}/api/v1` `` — appending
the prefix yourself produces `/api/v1/api/v1` and every dashboard call 404s.

There is no `SESSION_SECRET`. The dashboard stores the API's own JWTs in
httpOnly cookies and signs nothing of its own, so there is no secret to set —
nothing in the code reads that variable.

To run it locally against the deployed API, put the same line in
`apps/dashboard/.env.local` and `pnpm --filter @haala/dashboard dev`. Note
cookies are only marked `secure` when `NODE_ENV === 'production'`, so local HTTP
works.

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
