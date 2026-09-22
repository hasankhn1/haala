import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import type {
  CreateFeaturedProductInput,
  FeaturedProductView,
  ProductPickerRow,
  UpdateFeaturedProductInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import { brands, businessTypes, categories, homeProducts, products } from '../../db/schema';

/**
 * "Popular right now" — the products ops has chosen for the marketplace home.
 *
 * The list is **exclusive**: what is here is what a customer sees, in this
 * order, and nothing else. The automatic discount ranking this replaced gave
 * ops no say in the most valuable strip of the app.
 *
 * Reads here join through to the product so the dashboard can render something
 * an editor can actually arrange. The *customer* read path does not use this
 * service at all — it takes the ids and prices them for a store through
 * `catalogRepository.listProductsByIds`, because stock and price are per store
 * and this list is not.
 */

/** A product is sellable when it is on sale and its shop is not suspended. */
const sellableExpr = sql<boolean>`${products.isActive} and ${brands.status} = 'active'`;

export const featuredService = {
  /**
   * The curated list for the dashboard, including features that are currently
   * withheld from the app — an editor needs to see those precisely *because*
   * they are not appearing.
   */
  async list(): Promise<FeaturedProductView[]> {
    const rows = await db
      .select({
        id: homeProducts.id,
        productId: homeProducts.productId,
        isActive: homeProducts.isActive,
        sortOrder: homeProducts.sortOrder,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        departmentKey: businessTypes.key,
        imageUrl: products.imageUrl,
        basePrice: products.basePrice,
        sellable: sellableExpr,
      })
      .from(homeProducts)
      .innerJoin(products, eq(products.id, homeProducts.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .orderBy(asc(homeProducts.sortOrder), asc(products.name));

    return rows.map((r) => ({ ...r, sellable: Boolean(r.sellable) }));
  },

  /**
   * The ids the home screen should draw, in order.
   *
   * Deliberately thin — no joins, no product detail. The caller prices them
   * against a store, and every question about availability is answered there.
   */
  async activeProductIds(): Promise<string[]> {
    const rows = await db
      .select({ productId: homeProducts.productId })
      .from(homeProducts)
      .where(eq(homeProducts.isActive, true))
      .orderBy(asc(homeProducts.sortOrder), asc(homeProducts.createdAt));
    return rows.map((r) => r.productId);
  },

  /** Candidates for the dashboard picker. Product-grained, no store involved. */
  async search(q: string | undefined, limit: number): Promise<ProductPickerRow[]> {
    return db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        departmentKey: businessTypes.key,
        imageUrl: products.imageUrl,
        basePrice: products.basePrice,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(
        and(
          eq(products.isActive, true),
          eq(brands.status, 'active'),
          ...(q ? [ilike(products.name, `%${q}%`)] : []),
        ),
      )
      .orderBy(asc(products.name))
      .limit(limit);
  },

  async create(input: CreateFeaturedProductInput): Promise<FeaturedProductView> {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw AppError.notFound('Product not found');

    /*
     * Appended to the end unless told otherwise, and "the end" is one past the
     * highest — not the row count. The two differ the moment the numbers are
     * not a clean run, and reusing an existing number puts the new feature at
     * an arbitrary position among its equals.
     */
    const sortOrder = input.sortOrder ?? (await this.nextSortOrder());

    await db
      .insert(homeProducts)
      .values({ productId: input.productId, sortOrder })
      // Featuring something already featured is not an error — it is a no-op
      // with a reorder, which is what an editor means by it.
      .onConflictDoUpdate({
        target: homeProducts.productId,
        set: { isActive: true, sortOrder, updatedAt: new Date() },
      });

    const found = (await this.list()).find((f) => f.productId === input.productId);
    if (!found) throw AppError.internal('Failed to read back the featured product');
    return found;
  },

  async update(id: string, input: UpdateFeaturedProductInput): Promise<FeaturedProductView> {
    // Key by key, so an absent field is left alone rather than nulled. The same
    // spread bug once blanked a banner's badge on every reorder.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    const [row] = await db
      .update(homeProducts)
      .set(patch)
      .where(eq(homeProducts.id, id))
      .returning({ productId: homeProducts.productId });
    if (!row) throw AppError.notFound('Featured product not found');

    const found = (await this.list()).find((f) => f.productId === row.productId);
    if (!found) throw AppError.internal('Failed to read back the featured product');
    return found;
  },

  async remove(id: string): Promise<void> {
    const [row] = await db
      .delete(homeProducts)
      .where(eq(homeProducts.id, id))
      .returning({ id: homeProducts.id });
    if (!row) throw AppError.notFound('Featured product not found');
  },

  async nextSortOrder(): Promise<number> {
    const [row] = await db
      .select({ sortOrder: homeProducts.sortOrder })
      .from(homeProducts)
      .orderBy(desc(homeProducts.sortOrder))
      .limit(1);
    return row ? row.sortOrder + 1 : 0;
  },
};
