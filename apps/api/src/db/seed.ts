import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import { BrandStatus, BusinessTypeKey, businessTypeSpecs, rupees } from '@haala/shared';
import { logger } from '../common/logger';
import { closeDb, db } from './client';
import { authProviders, brands, businessTypes, categories, inventory, productVariants,
  products, promotions, riders, stores, users } from './schema';
import {
  SEED_CATEGORIES,
  SEED_PASSWORD,
  SEED_PROMOTIONS,
  SEED_STORES,
  SEED_USERS,
} from './seed-data';

/**
 * Dev seed: dark stores, the full category tree and catalogue, plus per-store
 * stock. Run with `pnpm --filter @haala/api db:seed`.
 *
 * It is **idempotent and self-updating** — everything upserts on its natural
 * key (store code, category slug, product slug), so re-running after editing
 * `seed-data.ts` refreshes names, prices and images in place instead of
 * skipping rows or duplicating them. Safe to run repeatedly.
 *
 * Catalogue content and image URLs live in `seed-data.ts`; this file is only
 * the loading logic.
 */

/**
 * Deterministic pseudo-random from a string, so stock levels and offers look
 * varied but stay identical across runs (a re-seed shouldn't silently change
 * what's in stock while you're testing).
 */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
};

const seed = async (): Promise<void> => {
  logger.info('Seeding dev data…');

  // ── Demo accounts ───────────────────────────────────────────────────────
  // Riders get a profile row lazily on first API call (see riderService), so
  // only the user needs seeding here.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of SEED_USERS) {
    const { homeStoreCode: _ignored, ...user } = u as typeof u & { homeStoreCode?: string };
    await db
      .insert(users)
      // `deliveryPhone` belongs in both branches: the conflict path alone
      // leaves it NULL on a fresh database, which only shows up when you seed
      // one from scratch rather than re-seeding an existing one.
      .values({ ...user, passwordHash, deliveryPhone: user.phone })
      .onConflictDoUpdate({
        target: users.phone,
        set: {
          name: user.name,
          role: user.role,
          passwordHash,
          isActive: true,
          // Everyone seeded signed up by phone, so that is also the number a
          // rider would call. Matches what migration 0010 backfills, and keeps
          // the delivery-contact sheet from opening for a seeded account.
          deliveryPhone: user.phone,
        },
      });

    // Identity is plural now: the original phone+password login is one
    // provider row rather than an implicit special case.
    const [row] = await db.select().from(users).where(eq(users.phone, user.phone)).limit(1);
    if (row) {
      await db
        .insert(authProviders)
        .values({ userId: row.id, provider: 'phone', providerUserId: user.phone })
        .onConflictDoNothing();
    }
  }
  logger.info({ count: SEED_USERS.length }, 'demo accounts ready');

  // ── Stores ──────────────────────────────────────────────────────────────
  for (const s of SEED_STORES) {
    await db
      .insert(stores)
      .values(s)
      .onConflictDoUpdate({
        target: stores.code,
        set: {
          name: s.name,
          addressLine: s.addressLine,
          area: s.area,
          city: s.city,
          latitude: s.latitude,
          longitude: s.longitude,
          deliveryRadiusMeters: s.deliveryRadiusMeters,
          isActive: true,
        },
      });
  }
  const storeRows = await db
    .select()
    .from(stores)
    .where(
      inArray(
        stores.code,
        SEED_STORES.map((s) => s.code),
      ),
    );
  logger.info({ count: storeRows.length }, 'stores ready');

  // ── Rider profiles + home stores ────────────────────────────────────────
  // A rider's home store scopes which orders they're offered, so seeding it
  // here is what makes the demo riders see anything at all.
  const storeByCode = new Map(storeRows.map((s) => [s.code, s]));
  for (const u of SEED_USERS) {
    const homeStoreCode = (u as { homeStoreCode?: string }).homeStoreCode;
    if (!homeStoreCode) continue;
    const [userRow] = await db.select().from(users).where(eq(users.phone, u.phone)).limit(1);
    const store = storeByCode.get(homeStoreCode);
    if (!userRow || !store) continue;
    await db
      .insert(riders)
      .values({ userId: userRow.id, storeId: store.id })
      .onConflictDoUpdate({ target: riders.userId, set: { storeId: store.id } });
  }

  // ── Business types and the house brand ──────────────────────────────────
  // Everything in `seed-data.ts` predates brands and belongs to Haala itself,
  // so the house brand is seeded first and owns all of it. This mirrors what
  // migration 0008 does to production data.
  for (const [index, key] of Object.keys(businessTypeSpecs).entries()) {
    const spec = businessTypeSpecs[key as BusinessTypeKey];
    await db
      .insert(businessTypes)
      .values({ key: spec.key, name: spec.name, sortOrder: index })
      .onConflictDoUpdate({
        target: businessTypes.key,
        set: { name: spec.name, sortOrder: index, isActive: true },
      });
  }

  const [groceryType] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.key, BusinessTypeKey.Grocery))
    .limit(1);
  if (!groceryType) throw new Error('Failed to resolve the grocery business type');

  await db
    .insert(brands)
    .values({
      name: 'Haala',
      slug: 'haala',
      businessTypeId: groceryType.id,
      status: BrandStatus.Active,
      description: 'Everyday groceries, delivered across DHA Peshawar.',
    })
    .onConflictDoUpdate({
      target: brands.slug,
      set: { businessTypeId: groceryType.id, status: BrandStatus.Active },
    });

  const [houseBrand] = await db.select().from(brands).where(eq(brands.slug, 'haala')).limit(1);
  if (!houseBrand) throw new Error('Failed to resolve the house brand');

  let productCount = 0;
  let stockRows = 0;

  // ── Categories → products → per-store inventory ─────────────────────────
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    await db
      .insert(categories)
      .values({
        brandId: houseBrand.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: [categories.brandId, categories.slug],
        set: {
          name: category.name,
          imageUrl: category.imageUrl,
          sortOrder: index,
          isActive: true,
        },
      });

    const [categoryRow] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.brandId, houseBrand.id), eq(categories.slug, category.slug)))
      .limit(1);
    if (!categoryRow) throw new Error(`Failed to resolve category ${category.slug}`);

    for (const item of category.products) {
      const basePrice = rupees(item.price);

      await db
        .insert(products)
        .values({
          brandId: houseBrand.id,
          categoryId: categoryRow.id,
          name: item.name,
          slug: item.slug,
          description: item.description,
          imageUrl: item.imageUrl,
          unit: item.unit,
          basePrice,
        })
        .onConflictDoUpdate({
          target: [products.brandId, products.slug],
          set: {
            categoryId: categoryRow.id,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            unit: item.unit,
            basePrice,
            isActive: true,
          },
        });

      const [productRow] = await db
        .select()
        .from(products)
        .where(eq(products.slug, item.slug))
        .limit(1);
      if (!productRow) continue;
      productCount += 1;

      /**
       * Every product needs its default variant — `sortOrder: 0`, of which a
       * partial unique index allows exactly one. Stock hangs off the variant,
       * so without this there is nothing to stock.
       */
      await db
        .insert(productVariants)
        .values({
          productId: productRow.id,
          label: item.unit,
          unit: item.unit,
          basePrice,
          sortOrder: 0,
        })
        .onConflictDoUpdate({
          target: [productVariants.productId, productVariants.label],
          set: { unit: item.unit, basePrice, isActive: true },
        });

      const [variantRow] = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, productRow.id), eq(productVariants.sortOrder, 0)))
        .limit(1);
      if (!variantRow) continue;

      for (const store of storeRows) {
        const r = hash(`${store.code}:${item.slug}`);

        // A couple of items per store are deliberately out of stock so the
        // empty/out-of-stock UI states have something to render.
        const quantityAvailable = r < 0.06 ? 0 : 12 + Math.floor(r * 180);

        // ~18% carry a store-level markdown, which is what surfaces the
        // discount badge and "you save" line in the app.
        const price = r > 0.82 ? Math.round((basePrice * 0.85) / 100) * 100 : null;

        await db
          .insert(inventory)
          .values({ storeId: store.id, variantId: variantRow.id, quantityAvailable, price })
          .onConflictDoUpdate({
            target: [inventory.storeId, inventory.variantId],
            set: { quantityAvailable, price },
          });
        stockRows += 1;
      }
    }
  }

  // Launch promo codes. Upserted on `code` like everything else, but note the
  // `set` deliberately omits `usedCount` — re-seeding must not wipe redemptions
  // that real customers have already made.
  for (const promo of SEED_PROMOTIONS) {
    await db
      .insert(promotions)
      .values(promo)
      .onConflictDoUpdate({
        target: promotions.code,
        set: {
          type: promo.type,
          value: promo.value,
          minOrderTotal: promo.minOrderTotal,
          maxDiscount: promo.maxDiscount,
          usageLimit: promo.usageLimit,
          perUserLimit: promo.perUserLimit,
          isActive: promo.isActive,
        },
      });
  }

  logger.info(
    {
      stores: storeRows.length,
      categories: SEED_CATEGORIES.length,
      products: productCount,
      inventoryRows: stockRows,
      promotions: SEED_PROMOTIONS.length,
    },
    'Seed complete ✔',
  );
};

seed()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
