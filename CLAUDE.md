# Working on Haala

Quick-commerce grocery delivery for DHA Peshawar, Pakistan (PKR), now a
multi-tenant **marketplace**: Haala's own grocery catalogue plus home
businesses — bakery, clothing, produce — each with their own login and
dashboard. Grocery and clothing are live; the rest are seeded and waiting for
stock.

New here? Read `ONBOARDING.md` first. This file is the short list of things that
are easy to get wrong.

## Invariants

Breaking one of these breaks money or tenancy, silently.

- **Money is integer paisa.** Never floats. `formatPKR` at display only. The
  Safepay decimal-rupee conversion is the highest-consequence arithmetic in the
  codebase and has its own tests.
- **Every brand-scoped repository function takes `brandId` as its required first
  parameter.** No overload omits it, so forgetting the tenant is a compile error
  rather than a cross-tenant query.
- **Cross-tenant access returns 404, never 403.** A 403 confirms the row exists,
  which is enough to enumerate a competitor's catalogue by id.
- **The tenant comes from the verified token**, via `brandScope`. Never from a
  body, param or query for a `brand_user`.
- **Critical operations use `db.transaction()`**: order create/cancel, inventory
  reserve, payment confirm, refund, variant delete-and-promote.
- **Components consume `theme.colors.*`, never `theme.palette.*`.** Reaching
  past the semantic layer is what makes the next re-theme cost forty files
  instead of two.
- A product always has **exactly one variant at `sort_order = 0`** — the
  catalogue joins on it to price a card. Enforced by
  `product_variants_default_uq`.
- **A basket belongs to one department**, and which one is read from the
  product's brand, server-side. Never a request field — accepting one lets a
  caller drop a shirt into the grocery basket. `carts_user_department_uq`.
- **An order draws from one basket.** It is picked and dispatched from one shop,
  so `POST /orders` names a department and `placeOrder` reads that basket only.
- **A department screen shows only its own department.** Both
  `/catalog/products` and `/catalog/categories` take `department`, and the
  paginated `total` must be filtered too — an unfiltered count prints "89
  products" above a shop holding 17.
- **Per-customer data never enters a cached response.** `GET /catalog/home` is
  cached per *store* and shared by everyone near it; "buy it again" is a
  separate authenticated request for exactly this reason.

## Traps

Each of these has already cost a debugging session.

| Trap | What to do |
| --- | --- |
| The adb reverse tunnel dies on every emulator or adb restart, and presents as "can't sign in" or "500 errors" — never as something networking-shaped | `adb reverse --list` **first**. Empty → `pnpm android:reverse` |
| Local Postgres and Redis are on **5433 / 6380** — Homebrew holds 5432/6379 | `role haala does not exist` means you hit the host Postgres |
| `pnpm add` for an Expo package pulls a version for the wrong SDK and nests it, failing Gradle 26 minutes in | Always `expo install` |
| The Kotlin pin must match React Native's own | RN 0.76.9 → `1.9.25`, in both `apps/*/app.json`. Only Gradle catches a mismatch |
| `react-dom` unpinned crashes both Expo apps on web at runtime, and bundles fine | All three apps pin `18.3.1` |
| Metro resolves `require()` at **bundle** time | A runtime `Platform.OS` guard does not prevent a bundling failure. Split with `.web.tsx` |
| Maps never work in Expo Go — it uses its own Maps key | Judge maps only from a dev build or the APK |
| `app.config.js` values reach the native project **only when prebuild runs**, and `expo run:android` reuses an existing `android/` as-is — so a key added to `.env` after the last prebuild is simply absent, and the map draws grey with nothing in the logs | `grep -c geo.API_KEY apps/customer/android/app/src/main/AndroidManifest.xml` — 0 means `npx expo prebuild --clean -p android` |
| Drizzle qualifies column names in a `sql` template **only when the outer query has a join** | Without one, a correlated subquery silently self-compares and returns 0. Write the qualification by hand |
| Drizzle runs **all pending migrations in one transaction** | `ALTER TYPE … ADD VALUE` then using that value fails. Recreate the type instead |
| `ADD COLUMN … NOT NULL` fails on a table with rows | Expand → backfill → contract, in separate files |
| A dev server on :3000 corrupts a concurrent `next build` | Stop it first |
| Two branches both generate migration `00NN` and the merge conflicts on `meta/_journal.json` | The one already on `origin/production` keeps the number. Delete yours, `drizzle-kit generate` again on top of theirs, then restore the descriptive filename and journal tag. Never renumber the snapshot by hand — it is a chained diff |
| `@haala/shared` builds to `dist`, and the API and dashboard resolve it from there | `pnpm --filter @haala/shared build` after **any** contract edit, or typecheck reports a field you just added as missing |
| A `try/catch` around Redis is only half of failing open | ioredis *queues* while disconnected and retries with backoff, so a dead cache answers correctly in 1.2s, then 4.5s, then 7.8s. Every call in `common/cache.ts` is also bounded by a 150ms timeout |
| React Native Web silently drops `accessibilityState` | A tab rendered `role` and `aria-label` and no `aria-selected`. Put the state in the label too |
| `flexWrap` is not CSS Grid | A grid built from wrapping flex does **not** align rows: one taller card pushes only its own column. Give cards a fixed image height and reserve the text lines, or rows stagger |
| Auth is rate-limited to 30 requests per 15 minutes, and browser-driven testing burns it fast | The limiter is in-memory: restart the API to clear it |
| Next reads env **once at boot**, so a dashboard started before you edited `.env.local` keeps the old value — and every screen looks normal while it does | Before believing a data bug, check the red strip at the top of the dashboard, or the `- API:` line in its startup log. No strip means localhost |

## Verifying

```bash
pnpm typecheck                        # all workspaces
pnpm test                             # 178 API + 32 shared, node:test via tsx
pnpm --filter @haala/dashboard build
cd apps/customer && node ../../node_modules/expo/bin/cli export -p android --output-dir /tmp/x
```

Invoke the Expo CLI **by path** — the `.bin/expo` shim is broken under the
hoisted layout.

**Tooling does not catch the things that matter most here.** Typecheck and
`expo export` both passed while map markers were invisible, while empty-state
glyphs were clipped, while a count query returned 0 for every row, and while a
route existed in a file but had never been registered. Tenancy isolation passes
typecheck whether or not it holds — only
`apps/api/src/modules/brand/isolation.test.ts` distinguishes the two.

So: **break it on purpose.** Every guarantee added since August has a test that
was verified by sabotaging the code and watching it fail — the department
filter, the cache's fail-open, the basket split, the 7-day sweep, banner
authorization. A test that has never been seen to fail is a test you are
guessing about.

And **render the screen.** Typecheck says nothing about what happens during
render; `expo start --web` plus headless Chrome over CDP will click and type
against the real app. That is how the staggered product grid, the invisible
ETA pill on a dark header, and a "Back to basket" button that went to checkout
were all found — none of them was visible in the diff.

## Do not

- **Push.** `gh` here is authenticated as `hassan-eyewa` while the repo belongs
  to `hasankhn1`. Ask Hassan to run `git push`. `production` is the default
  branch and Railway deploys from it, so a push is a deploy.
- **Run `db:push` against anything but local.** It infers changes and will drop
  a column. Production applies generated SQL from `apps/api/drizzle/`.
- **Run `db:seed` against production.** It would put orderable fake garments in
  a live shop. Same shape of mistake as the one above.
- **Commit `.env`.** It holds live R2 and Safepay credentials.
- **Re-litigate settled decisions**: Express over NestJS, the Basket design
  system, Railway, and brands stocking shared dark stores. The reasoning is in
  `ONBOARDING.md`; reopening them costs a day and lands in the same place.
- **Work from a cached copy of the design.** Re-fetch every time — a stale copy
  once went a whole screen out of date. There are now three files:
  `Grocery App.dc.html` (the department shell), `Auth & Checkout.dc.html`, and
  `Haala Home.dc.html` (the marketplace home).
- **Substitute a layout for the comp's.** The marketplace home was first built
  with full-width stacked cards where the comp draws a 210px horizontal rail,
  and with a "Coming soon" section the design does not have. If the comp cannot
  be built as drawn — RN has no CSS Grid, so its per-department image heights
  stagger a wrapping flex row — say so in a comment at the point of deviation
  rather than quietly redesigning.

## A boundary worth knowing

A brand owns **product definitions**; Haala owns **stock**. A vendor can take a
product off sale (`products.isActive`), but the per-store count
(`inventory.quantityAvailable`) belongs to whoever physically has the boxes.
The vendor dashboard shows it read-only, and the API rejects a write.

## Where things are

| Doc | For |
| --- | --- |
| `ONBOARDING.md` | New to the project — start here |
| `ARCHITECTURE.md` | Module map, data model, request lifecycle, multi-tenancy |
| `DEPLOYMENT.md` | Railway, environment variables, migrations in production |
| `packages/design-tokens/DESIGN.md` | The Basket design system — read before changing a token |
