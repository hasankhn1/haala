import bcrypt from 'bcryptjs';
import { and, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { BrandStatus, BusinessTypeKey, businessTypeSpecs, rupees } from '@haala/shared';
import { logger } from '../common/logger';
import { closeDb, db } from './client';
import {
  authProviders,
  brands,
  businessTypes,
  categories,
  inventory,
  productVariants,
  products,
  promotions,
  riders,
  stores,
  users,
} from './schema';
import {
  SEED_CATEGORIES,
  SEED_CLOTHING_BRAND,
  type SeedCategory,
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
    // `SEED_STORES` is `as const`, so `s.polygon` (where present) is a
    // readonly tuple — spread to a mutable array for Drizzle's insert type.
    const polygon = 'polygon' in s ? [...s.polygon] : null;
    await db
      .insert(stores)
      .values({ ...s, polygon })
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
          polygon,
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

  /**
   * Load one brand's catalogue: categories → products → variants → per-store
   * inventory.
   *
   * Extracted from the single loop this used to be, so a second department can
   * be seeded without a second copy of it. Everything inside is unchanged apart
   * from the brand no longer being assumed.
   */
  /**
   * @param businessTypeKey the brand's type, used to validate product
   * `attributes`. A boutique's fields are the whole point of business types, so
   * seeding invalid ones would leave the feature looking implemented and
   * untested.
   */
  async function seedCatalogue(
    brandId: string,
    businessTypeKey: BusinessTypeKey,
    cats: SeedCategory[],
  ): Promise<void> {
    const spec = businessTypeSpecs[businessTypeKey];

    /*
     * Everything this brand is declared to sell. Anything else it currently
     * sells is taken off sale at the end.
     *
     * Without that step the seed only ever adds: renaming a slug leaves the old
     * row behind and the catalogue shows the same garment twice — which is how
     * this boutique ended up with both `womens-chiffon-suit` and
     * `womens-embroidered-chiffon`.
     *
     * Deactivated rather than deleted. `order_items` references products and a
     * receipt should still name what was bought; "off sale" is exactly what
     * `is_active` means, and it is what the vendor dashboard's own control does.
     */
    const declaredSlugs = cats.flatMap((c) => c.products.map((pr) => pr.slug));
  // ── Categories → products → per-store inventory ─────────────────────────
  for (const [index, category] of cats.entries()) {
    await db
      .insert(categories)
      .values({
        brandId,
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
      .where(and(eq(categories.brandId, brandId), eq(categories.slug, category.slug)))
      .limit(1);
    if (!categoryRow) throw new Error(`Failed to resolve category ${category.slug}`);

    for (const item of category.products) {
      const basePrice = rupees(item.price);

      // Fail loudly here rather than shipping a product the dashboard's form
      // cannot render — the schema and that form come from the same entry.
      const parsed = spec.schema.safeParse(item.attributes ?? {});
      if (!parsed.success) {
        throw new Error(
          `${item.slug}: attributes do not match the ${businessTypeKey} spec — ` +
            JSON.stringify(parsed.error.flatten().fieldErrors),
        );
      }
      const attributes = parsed.data as Record<string, unknown>;

      await db
        .insert(products)
        .values({
          brandId,
          categoryId: categoryRow.id,
          name: item.name,
          slug: item.slug,
          description: item.description,
          imageUrl: item.imageUrl,
          unit: item.unit,
          basePrice,
          attributes,
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
            attributes,
            isActive: true,
          },
        });

      /*
       * Scoped to the brand. The unique index is `(brandId, slug)`, so a bare
       * slug lookup was only ever correct while one brand existed — with two,
       * it can resolve another brand's product and then stock it, silently.
       */
      const [productRow] = await db
        .select()
        .from(products)
        .where(and(eq(products.brandId, brandId), eq(products.slug, item.slug)))
        .limit(1);
      if (!productRow) continue;
      productCount += 1;

      /**
       * Every product needs a default variant — `sortOrder: 0`, of which a
       * partial unique index allows exactly one. Stock hangs off the variant,
       * so without this there is nothing to stock.
       *
       * A product with no `variants` gets exactly that one, labelled by its
       * unit, which is what grocery wants. A product that declares sizes gets
       * one per size, the first being the default.
       */
      const declared = item.variants ?? [{ label: item.unit }];
      const declaredLabels = declared.map((v) => v.label);

      /*
       * Park every existing variant out of the way before writing the new set.
       *
       * `product_variants_default_uq` allows exactly one variant per product at
       * `sort_order = 0`. Re-seeding a product whose sizes changed — this
       * boutique's did, from a single "Medium" to a real size run — inserts the
       * new default while the old one still holds 0, and the index rejects it.
       * Moving them aside first makes the seed converge on the declared set
       * instead of only working against an empty database.
       *
       * Surviving labels keep their row and therefore their id, so inventory
       * and anything holding a variant reference are not churned on every run.
       */
      await db
        .update(productVariants)
        .set({ sortOrder: sql`${productVariants.sortOrder} + 1000` })
        .where(
          and(eq(productVariants.productId, productRow.id), lt(productVariants.sortOrder, 1000)),
        );

      for (const [order, variant] of declared.entries()) {
        const variantPrice = basePrice + rupees(variant.priceDelta ?? 0);

        await db
          .insert(productVariants)
          .values({
            productId: productRow.id,
            label: variant.label,
            unit: item.unit,
            basePrice: variantPrice,
            sortOrder: order,
          })
          .onConflictDoUpdate({
            target: [productVariants.productId, productVariants.label],
            set: { unit: item.unit, basePrice: variantPrice, sortOrder: order, isActive: true },
          });

        const [variantRow] = await db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productRow.id),
              eq(productVariants.label, variant.label),
            ),
          )
          .limit(1);
        if (!variantRow) continue;

        for (const store of storeRows) {
          // Seeded by store **and size**, so sizes sell out independently —
          // an M gone while the L is on the shelf is the normal boutique case
          // and the one the size picker has to render.
          const r = hash(`${store.code}:${item.slug}:${variant.label}`);

          // A few lines per store are deliberately out of stock so the
          // empty/out-of-stock UI states have something to render.
          const quantityAvailable = r < 0.12 ? 0 : 6 + Math.floor(r * 90);

          // ~18% carry a store-level markdown, which is what surfaces the
          // discount badge and "you save" line in the app.
          const price = r > 0.82 ? Math.round((variantPrice * 0.85) / 100) * 100 : null;

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

      /*
       * Anything still parked is a label this product no longer sells. Deleting
       * it cascades to its inventory, which is what "this size is discontinued"
       * means. Order history is unaffected — `order_items` keeps `product_id`
       * and nulls the variant.
       */
      await db
        .delete(productVariants)
        .where(
          and(
            eq(productVariants.productId, productRow.id),
            notInArray(productVariants.label, declaredLabels),
          ),
        );
    }
  }

    const retired = await db
      .update(products)
      .set({ isActive: false })
      .where(and(eq(products.brandId, brandId), notInArray(products.slug, declaredSlugs)))
      .returning({ slug: products.slug });
    if (retired.length > 0) {
      logger.info({ count: retired.length, slugs: retired.map((r) => r.slug) }, 'taken off sale');
    }
  }

  await seedCatalogue(houseBrand.id, BusinessTypeKey.Grocery, SEED_CATEGORIES);

  /*
   * A second department, so the marketplace home has more than one live card
   * and cross-department behaviour is exercisable at all.
   *
   * Deliberately a *separate brand* rather than more categories under the house
   * brand: a department is a business type, a business type belongs to brands,
   * and collapsing that here would make the seed disagree with the model the
   * dashboard and the API enforce.
   *
   * Note what is *not* special-cased — `isLive` on `/catalog/departments` needs
   * no change for clothing to appear. If it did, the rule would be wrong.
   */
  const [clothingType] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.key, SEED_CLOTHING_BRAND.businessTypeKey))
    .limit(1);
  if (!clothingType) {
    throw new Error(
      `Seed brand "${SEED_CLOTHING_BRAND.slug}" names business type ` +
        `"${SEED_CLOTHING_BRAND.businessTypeKey}", which does not exist.`,
    );
  }

  await db
    .insert(brands)
    .values({
      name: SEED_CLOTHING_BRAND.name,
      slug: SEED_CLOTHING_BRAND.slug,
      businessTypeId: clothingType.id,
      status: BrandStatus.Active,
      description: SEED_CLOTHING_BRAND.description,
    })
    .onConflictDoUpdate({
      target: brands.slug,
      set: { businessTypeId: clothingType.id, status: BrandStatus.Active },
    });

  const [clothingBrand] = await db
    .select()
    .from(brands)
    .where(eq(brands.slug, SEED_CLOTHING_BRAND.slug))
    .limit(1);
  if (!clothingBrand) throw new Error('Failed to resolve the clothing brand');

  await seedCatalogue(
    clothingBrand.id,
    SEED_CLOTHING_BRAND.businessTypeKey as BusinessTypeKey,
    SEED_CLOTHING_BRAND.categories,
  );

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
