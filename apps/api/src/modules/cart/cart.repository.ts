import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  brands,
  businessTypes,
  cartItems,
  carts,
  productVariants,
  products,
  type Cart,
  type CartItem,
  type Product,
  type ProductVariant,
} from '../../db/schema';

/**
 * A basket line holds a **variant**, but renders as a product: the name and
 * photo come from the product, the size and price from the variant.
 */
export type CartItemWithProduct = CartItem & {
  product: Pick<Product, 'id' | 'name' | 'imageUrl'>;
  variant: Pick<ProductVariant, 'id' | 'label' | 'unit' | 'basePrice'>;
};

export const cartRepository = {
  async getByUser(userId: string, department: string, ex: Executor = db): Promise<Cart | undefined> {
    const [row] = await ex
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.departmentKey, department)))
      .limit(1);
    return row;
  },

  /** Every basket this customer holds, newest activity first. */
  async listByUser(userId: string, ex: Executor = db): Promise<Cart[]> {
    return ex
      .select()
      .from(carts)
      .where(eq(carts.userId, userId))
      .orderBy(desc(carts.updatedAt));
  },

  async getOrCreate(userId: string, department: string, ex: Executor = db): Promise<Cart> {
    const existing = await this.getByUser(userId, department, ex);
    if (existing) return existing;
    const [row] = await ex
      .insert(carts)
      .values({ userId, departmentKey: department })
      // The unique pair, not the user — a customer legitimately has several.
      .onConflictDoNothing({ target: [carts.userId, carts.departmentKey] })
      .returning();
    return row ?? ((await this.getByUser(userId, department, ex)) as Cart);
  },

  /**
   * Which department a variant belongs to, from its product's brand.
   *
   * The single source of truth for which basket something lands in. Asking the
   * database rather than accepting a field means a caller cannot put a shirt in
   * the grocery basket, which is the guarantee the whole split rests on.
   */
  async departmentForVariant(variantId: string, ex: Executor = db): Promise<string | undefined> {
    const [row] = await ex
      .select({ key: businessTypes.key })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(eq(productVariants.id, variantId))
      .limit(1);
    return row?.key;
  },

  /**
   * Mark a basket as active.
   *
   * Editing a line writes `cart_items.updated_at`, which says nothing about the
   * basket — so without this a basket a customer edits daily would still be
   * seven days stale and get emptied underneath them.
   */
  async touch(cartId: string, ex: Executor = db): Promise<void> {
    await ex.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  },

  /**
   * Empty every basket this customer has not touched since `cutoff`, and say
   * which. Prices move, stock moves, and an eight-day-old basket restored at
   * checkout is a worse surprise than an empty one.
   *
   * The basket row survives — only its lines go. Deleting the row would lose
   * the store it was attached to for no benefit, and it is recreated on the
   * next add regardless.
   */
  async clearStale(userId: string, cutoff: Date, ex: Executor = db): Promise<string[]> {
    const stale = await ex
      .select({ id: carts.id })
      .from(carts)
      .where(and(eq(carts.userId, userId), lt(carts.updatedAt, cutoff)));
    if (stale.length === 0) return [];

    const ids = stale.map((c) => c.id);
    const removed = await ex
      .delete(cartItems)
      .where(inArray(cartItems.cartId, ids))
      .returning({ cartId: cartItems.cartId });
    if (removed.length === 0) return [];

    // Only the baskets that actually held something are reported, so the app
    // can tell a customer their basket expired without saying it about the
    // empty ones they never used.
    const emptied = [...new Set(removed.map((r) => r.cartId))];
    await ex.update(carts).set({ updatedAt: new Date() }).where(inArray(carts.id, emptied));
    return emptied;
  },

  async setStore(cartId: string, storeId: string | null, ex: Executor = db): Promise<void> {
    await ex.update(carts).set({ storeId, updatedAt: new Date() }).where(eq(carts.id, cartId));
  },

  async items(cartId: string, ex: Executor = db): Promise<CartItemWithProduct[]> {
    const rows = await ex
      .select({
        item: cartItems,
        product: {
          id: products.id,
          name: products.name,
          imageUrl: products.imageUrl,
        },
        variant: {
          id: productVariants.id,
          label: productVariants.label,
          unit: productVariants.unit,
          basePrice: productVariants.basePrice,
        },
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(cartItems.cartId, cartId));
    return rows.map((r) => ({ ...r.item, product: r.product, variant: r.variant }));
  },

  async findItem(
    cartId: string,
    variantId: string,
    ex: Executor = db,
  ): Promise<CartItem | undefined> {
    const [row] = await ex
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
      .limit(1);
    return row;
  },

  async upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
    unitPrice: number,
    ex: Executor = db,
  ): Promise<void> {
    await ex
      .insert(cartItems)
      .values({ cartId, variantId, quantity, unitPrice })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: { quantity, unitPrice, updatedAt: new Date() },
      });
  },

  async removeItem(cartId: string, variantId: string, ex: Executor = db): Promise<void> {
    await ex
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  },

  async clear(cartId: string, ex: Executor = db): Promise<void> {
    await ex.delete(cartItems).where(eq(cartItems.cartId, cartId));
  },
};
