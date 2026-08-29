import { and, eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
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
  async getByUser(userId: string, ex: Executor = db): Promise<Cart | undefined> {
    const [row] = await ex.select().from(carts).where(eq(carts.userId, userId)).limit(1);
    return row;
  },

  async getOrCreate(userId: string, ex: Executor = db): Promise<Cart> {
    const existing = await this.getByUser(userId, ex);
    if (existing) return existing;
    const [row] = await ex
      .insert(carts)
      .values({ userId })
      .onConflictDoNothing({ target: carts.userId })
      .returning();
    return row ?? ((await this.getByUser(userId, ex)) as Cart);
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
