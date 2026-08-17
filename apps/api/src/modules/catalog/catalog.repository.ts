import { and, asc, count, eq, ilike, sql } from 'drizzle-orm';
import type { ProductsQuery } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import { categories, inventory, products, type Category } from '../../db/schema';

export interface ProductWithStock {
  id: string;
  name: string;
  slug: string;
  unit: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string;
  basePrice: number;
  price: number;
  availableQty: number;
}

/** Effective price = store override if present, else base price. */
const priceExpr = sql<number>`coalesce(${inventory.price}, ${products.basePrice})`;
const availableExpr = sql<number>`greatest(coalesce(${inventory.quantityAvailable}, 0) - coalesce(${inventory.quantityReserved}, 0), 0)`;

export const catalogRepository = {
  async listCategories(ex: Executor = db): Promise<Category[]> {
    return ex
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  },

  /**
   * List active products for a store, left-joined with that store's inventory
   * so price + availability reflect the store. Filterable by category + search.
   */
  async listProducts(
    query: ProductsQuery,
    ex: Executor = db,
  ): Promise<{ items: ProductWithStock[]; total: number }> {
    const conditions = [eq(products.isActive, true)];
    if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
    if (query.q) conditions.push(ilike(products.name, `%${query.q}%`));
    const where = and(...conditions);

    const joinOn = and(
      eq(inventory.productId, products.id),
      eq(inventory.storeId, query.storeId),
    );

    const rows = await ex
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        unit: products.unit,
        description: products.description,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        basePrice: products.basePrice,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(products)
      .leftJoin(inventory, joinOn)
      .where(where)
      .orderBy(asc(products.name))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const totalRows = await ex.select({ value: count() }).from(products).where(where);

    return { items: rows, total: Number(totalRows[0]?.value ?? 0) };
  },

  async findProductForStore(
    productId: string,
    storeId: string,
    ex: Executor = db,
  ): Promise<ProductWithStock | undefined> {
    const [row] = await ex
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        unit: products.unit,
        description: products.description,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        basePrice: products.basePrice,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(products)
      .leftJoin(
        inventory,
        and(eq(inventory.productId, products.id), eq(inventory.storeId, storeId)),
      )
      .where(and(eq(products.id, productId), eq(products.isActive, true)))
      .limit(1);
    return row;
  },
};
