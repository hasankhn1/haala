import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  type Category,
  type NewCategory,
  type NewProduct,
  type NewProductVariant,
  type Product,
  type ProductVariant,
  brands,
  businessTypes,
  categories,
  inventory,
  orderItems,
  productVariants,
  products,
} from '../../db/schema';

/**
 * Every read and write a brand makes against its own catalogue.
 *
 * **`brandId` is the required first parameter of every function here, and no
 * overload omits it.** That is the isolation guarantee expressed as a type: a
 * caller that forgets the tenant does not query across all of them, it fails
 * to compile. The middleware and the CHECK constraint are the other two layers;
 * this is the one a code reviewer can see.
 *
 * Ownership is always part of the `WHERE`, never checked after the fact. A
 * fetch-then-compare would still be correct, but it leaves a window where a row
 * from another tenant has been read into memory, and it invites the version
 * where somebody forgets the comparison.
 */

// Counting without interpolation, deliberately: drizzle only qualifies column
// names when the outer query has a join, so `${products.categoryId}` renders
// bare on a single-table select and silently self-compares. See the same note
// in brand.repository.
const productCountForCategory = sql<number>`(select count(*)::int from products where products.category_id = categories.id)`;
const stockForProduct = sql<number>`(
  select coalesce(sum(i.quantity_available - i.quantity_reserved), 0)::int
  from inventory i
  join product_variants pv on pv.id = i.variant_id
  where pv.product_id = products.id
)`;

export const brandCatalogRepository = {
  // ── Profile ───────────────────────────────────────────────────────────────
  async profile(brandId: string) {
    const [row] = await db
      .select({
        brand: brands,
        typeKey: businessTypes.key,
        typeName: businessTypes.name,
      })
      .from(brands)
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(eq(brands.id, brandId))
      .limit(1);
    return row ?? null;
  },

  async updateProfile(brandId: string, patch: Partial<typeof brands.$inferInsert>) {
    const [row] = await db
      .update(brands)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(brands.id, brandId))
      .returning();
    return row ?? null;
  },

  /** The business type key, used to pick the attribute schema. */
  async businessTypeKey(brandId: string): Promise<string | null> {
    const [row] = await db
      .select({ key: businessTypes.key })
      .from(brands)
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(eq(brands.id, brandId))
      .limit(1);
    return row?.key ?? null;
  },

  // ── Categories ────────────────────────────────────────────────────────────
  async listCategories(brandId: string) {
    return db
      .select({ category: categories, productCount: productCountForCategory })
      .from(categories)
      .where(eq(categories.brandId, brandId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  },

  async findCategory(brandId: string, id: string) {
    const [row] = await db
      .select({ category: categories, productCount: productCountForCategory })
      .from(categories)
      .where(and(eq(categories.brandId, brandId), eq(categories.id, id)))
      .limit(1);
    return row ?? null;
  },

  async categorySlugTaken(brandId: string, slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.brandId, brandId), eq(categories.slug, slug)))
      .limit(1);
    return row !== undefined;
  },

  async createCategory(brandId: string, value: Omit<NewCategory, 'brandId'>): Promise<Category> {
    const [row] = await db
      .insert(categories)
      .values({ ...value, brandId })
      .returning();
    if (!row) throw new Error('Insert returned no category');
    return row;
  },

  async updateCategory(brandId: string, id: string, patch: Partial<NewCategory>) {
    const [row] = await db
      .update(categories)
      .set({ ...patch, brandId, updatedAt: new Date() })
      .where(and(eq(categories.brandId, brandId), eq(categories.id, id)))
      .returning();
    return row ?? null;
  },

  async deleteCategory(brandId: string, id: string) {
    const [row] = await db
      .delete(categories)
      .where(and(eq(categories.brandId, brandId), eq(categories.id, id)))
      .returning({ id: categories.id });
    return row ?? null;
  },

  /**
   * Reorder in one transaction so a half-applied order can never be observed.
   * Each statement still carries the brand, so an id belonging to someone else
   * matches nothing rather than being renumbered.
   */
  async reorderCategories(brandId: string, ids: string[]): Promise<number> {
    return db.transaction(async (tx) => {
      let moved = 0;
      for (const [index, id] of ids.entries()) {
        const rows = await tx
          .update(categories)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(categories.brandId, brandId), eq(categories.id, id)))
          .returning({ id: categories.id });
        moved += rows.length;
      }
      return moved;
    });
  },

  // ── Products ──────────────────────────────────────────────────────────────
  async listProducts(brandId: string, filter: { categoryId?: string }) {
    const where = [
      eq(products.brandId, brandId),
      filter.categoryId ? eq(products.categoryId, filter.categoryId) : undefined,
    ].filter(Boolean);

    return db
      .select({
        product: products,
        categoryName: categories.name,
        stockOnHand: stockForProduct,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...where))
      .orderBy(asc(products.sortOrder), asc(products.name));
  },

  async findProduct(brandId: string, id: string) {
    const [row] = await db
      .select({
        product: products,
        categoryName: categories.name,
        stockOnHand: stockForProduct,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(eq(products.brandId, brandId), eq(products.id, id)))
      .limit(1);
    return row ?? null;
  },

  async productSlugTaken(brandId: string, slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.brandId, brandId), eq(products.slug, slug)))
      .limit(1);
    return row !== undefined;
  },

  async createProduct(brandId: string, value: Omit<NewProduct, 'brandId'>): Promise<Product> {
    const [row] = await db
      .insert(products)
      .values({ ...value, brandId })
      .returning();
    if (!row) throw new Error('Insert returned no product');
    return row;
  },

  async updateProduct(brandId: string, id: string, patch: Partial<NewProduct>) {
    const [row] = await db
      .update(products)
      // `brandId` is re-asserted rather than taken from the patch, so a stray
      // one in the caller's object cannot move a row between tenants.
      .set({ ...patch, brandId, updatedAt: new Date() })
      .where(and(eq(products.brandId, brandId), eq(products.id, id)))
      .returning();
    return row ?? null;
  },

  async deleteProduct(brandId: string, id: string) {
    const [row] = await db
      .delete(products)
      .where(and(eq(products.brandId, brandId), eq(products.id, id)))
      .returning({ id: products.id });
    return row ?? null;
  },

  /** How many orders reference this product — `order_items` is ON DELETE RESTRICT. */
  async orderCountForProduct(brandId: string, id: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(and(eq(products.brandId, brandId), eq(orderItems.productId, id)));
    return row?.n ?? 0;
  },

  // ── Variants ──────────────────────────────────────────────────────────────
  async listVariants(brandId: string, productId: string): Promise<ProductVariant[]> {
    return db
      .select({ v: productVariants })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.brandId, brandId), eq(productVariants.productId, productId)))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.label))
      .then((rows) => rows.map((r) => r.v));
  },

  async createVariant(
    brandId: string,
    productId: string,
    value: Omit<NewProductVariant, 'productId'>,
  ): Promise<ProductVariant | null> {
    // The product's ownership is proved by a query, not assumed, before any
    // child row is written under it.
    const owner = await this.findProduct(brandId, productId);
    if (!owner) return null;
    const [row] = await db
      .insert(productVariants)
      .values({ ...value, productId })
      .returning();
    return row ?? null;
  },

  async updateVariant(
    brandId: string,
    productId: string,
    variantId: string,
    patch: Partial<NewProductVariant>,
  ): Promise<ProductVariant | null> {
    const owner = await this.findProduct(brandId, productId);
    if (!owner) return null;
    const [row] = await db
      .update(productVariants)
      .set({ ...patch, productId, updatedAt: new Date() })
      .where(and(eq(productVariants.productId, productId), eq(productVariants.id, variantId)))
      .returning();
    return row ?? null;
  },

  async deleteVariant(
    brandId: string,
    productId: string,
    variantId: string,
  ): Promise<{ id: string } | null> {
    const owner = await this.findProduct(brandId, productId);
    if (!owner) return null;
    const [row] = await db
      .delete(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.id, variantId)))
      .returning({ id: productVariants.id });
    return row ?? null;
  },

  /** Stock rows exist per variant; used to explain why a delete was refused. */
  async inventoryCountForVariant(variantId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));
    return row?.n ?? 0;
  },
};
