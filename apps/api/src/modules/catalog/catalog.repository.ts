import { and, asc, count, eq, ilike, sql } from 'drizzle-orm';
import type { ProductsQuery } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import { categories, inventory, productVariants, products, type Category } from '../../db/schema';

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
  defaultVariantId: string | null;
}

/** Effective price = store override if present, else base price. */
/**
 * Effective price: the store's override if it has one, else the variant's own
 * base price — which is NOT NULL, so there is no third fallback. Falling back to
 * `products.basePrice` would both price a 1kg bag at the 500g price and force
 * every query using this expression to join `products`.
 */
const priceExpr = sql<number>`coalesce(${inventory.price}, ${productVariants.basePrice})`;
// SQL mirror of `availableToSell` (inventory.repository.ts): a line ops has
// suspended reads as zero stock, so `inStock` goes false across listing, search
// and product detail from this one expression.
const availableExpr = sql<number>`case when coalesce(${inventory.isAvailable}, true) then greatest(coalesce(${inventory.quantityAvailable}, 0) - coalesce(${inventory.quantityReserved}, 0), 0) else 0 end`;

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

    /**
     * A card shows one price and one stock figure, so the listing resolves each
     * product's **default variant**: `sortOrder = 0`, of which a partial unique
     * index guarantees exactly one per product. Loading every variant here
     * would multiply each product row by its variant count; the PDP fetches the
     * full set on its own.
     */
    const joinOn = and(
      eq(inventory.variantId, productVariants.id),
      eq(inventory.storeId, query.storeId),
    );
    const defaultVariantOn = and(
      eq(productVariants.productId, products.id),
      eq(productVariants.sortOrder, 0),
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
        defaultVariantId: productVariants.id,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(products)
      .leftJoin(productVariants, defaultVariantOn)
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
        defaultVariantId: productVariants.id,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(products)
      .leftJoin(
        productVariants,
        and(eq(productVariants.productId, products.id), eq(productVariants.sortOrder, 0)),
      )
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(and(eq(products.id, productId), eq(products.isActive, true)))
      .limit(1);
    return row;
  },

  /** Every sellable size of a product, cheapest-first by `sortOrder`. */
  async variantsForProduct(productId: string, storeId: string, ex: Executor = db) {
    return ex
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        label: productVariants.label,
        unit: productVariants.unit,
        basePrice: productVariants.basePrice,
        sortOrder: productVariants.sortOrder,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(productVariants)
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.sortOrder));
  },

  /**
   * One variant priced and stocked at a store — what the cart needs to know
   * before it will hold a line.
   */
  async findVariantForStore(variantId: string, storeId: string, ex: Executor = db) {
    const [row] = await ex
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        label: productVariants.label,
        unit: productVariants.unit,
        name: products.name,
        imageUrl: products.imageUrl,
        basePrice: productVariants.basePrice,
        price: priceExpr,
        availableQty: availableExpr,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.isActive, true),
          eq(products.isActive, true),
        ),
      )
      .limit(1);
    return row;
  },
};
