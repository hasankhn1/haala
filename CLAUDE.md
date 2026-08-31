# Working on Haala

Quick-commerce grocery delivery for DHA Peshawar, Pakistan (PKR), now a
multi-tenant platform: Haala's own catalogue plus home businesses — bakery,
clothing, produce — each with their own login and dashboard.

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
| Drizzle qualifies column names in a `sql` template **only when the outer query has a join** | Without one, a correlated subquery silently self-compares and returns 0. Write the qualification by hand |
| Drizzle runs **all pending migrations in one transaction** | `ALTER TYPE … ADD VALUE` then using that value fails. Recreate the type instead |
| `ADD COLUMN … NOT NULL` fails on a table with rows | Expand → backfill → contract, in separate files |
| A dev server on :3000 corrupts a concurrent `next build` | Stop it first |

## Verifying

```bash
pnpm typecheck                        # all workspaces
pnpm test                             # 71 API + 13 shared, node:test via tsx
pnpm --filter @haala/dashboard build
cd apps/customer && node ../../node_modules/expo/bin/cli export -p android --output-dir /tmp/x
```

Invoke the Expo CLI **by path** — the `.bin/expo` shim is broken under the
hoisted layout.

**Tooling does not catch the things that matter most here.** Typecheck and
`expo export` both passed while map markers were invisible, while empty-state
glyphs were clipped, and while a count query returned 0 for every row. Tenancy
isolation passes typecheck whether or not it holds — only
`apps/api/src/modules/brand/isolation.test.ts` distinguishes the two. When you
change something in that area, break it on purpose and confirm the tests fail.

## Do not

- **Push.** `gh` here is authenticated as `hassan-eyewa` while the repo belongs
  to `hasankhn1`. Ask Hassan to run `git push`.
- **Run `db:push` against anything but local.** It infers changes and will drop
  a column. Production applies generated SQL from `apps/api/drizzle/`.
- **Commit `.env`.** It holds live R2 and Safepay credentials.
- **Re-litigate settled decisions**: Express over NestJS, the Basket design
  system, Railway, and brands stocking shared dark stores. The reasoning is in
  `ONBOARDING.md`; reopening them costs a day and lands in the same place.
- **Work from a cached copy of the design.** Re-fetch `Grocery App.dc.html`
  every time — a stale copy once went a whole screen out of date.

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
