import { and, asc, count, eq, ilike, sql } from 'drizzle-orm';
import type { ProductsQuery } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import { brands, categories, inventory, productVariants, products, type Category } from '../../db/schema';

export interface ProductWithStock {
  id: string;
  brandName: string;
  brandSlug: string;
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

/**
 * Only an `active` brand may be seen by a shopper.
 *
 * Suspension has to mean something, and what it means is this: the catalogue
 * survives, the selling stops. Every customer-facing query below joins `brands`
 * for no other reason — a `pending` shop still being set up, or one Haala has
 * suspended, must not appear on a card, in a search, on a product page, or in
 * a basket.
 */
const sellableBrand = eq(brands.status, 'active');

export const catalogRepository = {
  /**
   * Categories a shopper may browse.
   *
   * Two filters beyond `isActive`, both of which became necessary the moment
   * categories stopped being global. The brand must be sellable, and the
   * category must contain something a shopper can actually buy.
   *
   * That second test has to mean the same thing here as in `listProducts`, or
   * the rail offers a tile that opens onto an empty list — which is exactly
   * what happened when this checked only for an *active* product: a vendor's
   * brand-new category appeared the moment they added one, before Haala had
   * received a single unit.
   *
   * It is stock *anywhere* rather than stock at this shopper's store, because
   * this endpoint takes no store. The remaining imprecision — a category whose
   * products are stocked at one store and not another — predates brands and
   * applies to the grocery catalogue too; closing it needs a `storeId` here,
   * and so a change in the apps.
   */
  async listCategories(ex: Executor = db): Promise<Category[]> {
    return ex
      .select({
        id: categories.id,
        brandId: categories.brandId,
        name: categories.name,
        slug: categories.slug,
        imageUrl: categories.imageUrl,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .innerJoin(brands, eq(brands.id, categories.brandId))
      .where(
        and(
          eq(categories.isActive, true),
          sellableBrand,
          sql`exists (
            select 1 from products
            join product_variants on product_variants.product_id = products.id
            join inventory on inventory.variant_id = product_variants.id
            where products.category_id = categories.id and products.is_active = true
          )`,
        ),
      )
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
    const conditions = [eq(products.isActive, true), sellableBrand];
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

    /**
     * Both joins are inner, which is a change in meaning worth being explicit
     * about: a product is listed only if this store actually carries it.
     *
     * Left-joining inventory used to show a product with no stock row at all as
     * merely out of stock. With one grocery catalogue stocked everywhere that
     * was indistinguishable; with brands it is not, because a vendor can add a
     * product before Haala has ever received one, and "temporarily sold out"
     * and "we have never had this" should not read the same to a shopper.
     */
    const rows = await ex
      .select({
        id: products.id,
        brandName: brands.name,
        brandSlug: brands.slug,
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
      .innerJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(productVariants, defaultVariantOn)
      .innerJoin(inventory, joinOn)
      .where(where)
      .orderBy(asc(products.name))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    // The count repeats the joins rather than filtering `products` alone. A
    // total that disagrees with the rows is a pagination bug that only shows up
    // on the last page, which is the worst place to find one.
    const totalRows = await ex
      .select({ value: count() })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(productVariants, defaultVariantOn)
      .innerJoin(inventory, joinOn)
      .where(where);

    return { items: rows, total: Number(totalRows[0]?.value ?? 0) };
  },

  async findProductForStore(
    productId: string,
    storeId: string,
    ex: Executor = db,
  ): Promise<ProductWithStock | undefined> {
    // Inventory stays a **left** join here, unlike the listing: someone
    // following a link to a product this store has run out of should see it
    // marked sold out, not a 404. The brand join is inner, because a suspended
    // shop's product should not open at all.
    const [row] = await ex
      .select({
        id: products.id,
        brandName: brands.name,
        brandSlug: brands.slug,
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
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        productVariants,
        and(eq(productVariants.productId, products.id), eq(productVariants.sortOrder, 0)),
      )
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(and(eq(products.id, productId), eq(products.isActive, true), sellableBrand))
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
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(
        and(eq(productVariants.productId, productId), eq(productVariants.isActive, true), sellableBrand),
      )
      .orderBy(asc(productVariants.sortOrder));
  },

  /**
   * One variant priced and stocked at a store — what the cart needs to know
   * before it will hold a line.
   *
   * The brand filter matters most here of all the queries in this file. This is
   * the gate the basket asks before accepting an item, so without it a shopper
   * could still add — and buy — from a shop Haala had suspended, simply by
   * having the product open when the suspension happened.
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
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        inventory,
        and(eq(inventory.variantId, productVariants.id), eq(inventory.storeId, storeId)),
      )
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.isActive, true),
          eq(products.isActive, true),
          sellableBrand,
        ),
      )
      .limit(1);
    return row;
  },
};
