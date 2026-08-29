import { and, eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  cartItems,
  carts,
  products,
  type Cart,
  type CartItem,
  type Product,
} from '../../db/schema';

export type CartItemWithProduct = CartItem & {
  product: Pick<Product, 'id' | 'name' | 'unit' | 'imageUrl' | 'basePrice'>;
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
          unit: products.unit,
          imageUrl: products.imageUrl,
          basePrice: products.basePrice,
        },
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cartId));
    return rows.map((r) => ({ ...r.item, product: r.product }));
  },

  async findItem(
    cartId: string,
    productId: string,
    ex: Executor = db,
  ): Promise<CartItem | undefined> {
    const [row] = await ex
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)))
      .limit(1);
    return row;
  },

  async upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    unitPrice: number,
    ex: Executor = db,
  ): Promise<void> {
    await ex
      .insert(cartItems)
      .values({ cartId, productId, quantity, unitPrice })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: { quantity, unitPrice, updatedAt: new Date() },
      });
  },

  async removeItem(cartId: string, productId: string, ex: Executor = db): Promise<void> {
    await ex
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  },

  async clear(cartId: string, ex: Executor = db): Promise<void> {
    await ex.delete(cartItems).where(eq(cartItems.cartId, cartId));
  },
};
