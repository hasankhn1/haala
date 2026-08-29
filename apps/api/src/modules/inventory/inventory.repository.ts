import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import { inventory, type Inventory } from '../../db/schema';

export const inventoryRepository = {
  async findForStoreProduct(
    storeId: string,
    productId: string,
    ex: Executor = db,
  ): Promise<Inventory | undefined> {
    const [row] = await ex
      .select()
      .from(inventory)
      .where(and(eq(inventory.storeId, storeId), eq(inventory.productId, productId)))
      .limit(1);
    return row;
  },

  async findManyForStore(
    storeId: string,
    productIds: string[],
    ex: Executor = db,
  ): Promise<Inventory[]> {
    if (productIds.length === 0) return [];
    return ex
      .select()
      .from(inventory)
      .where(and(eq(inventory.storeId, storeId), inArray(inventory.productId, productIds)));
  },

  /**
   * Lock the given store/product inventory rows FOR UPDATE. MUST run inside a
   * transaction — used by order placement to serialise concurrent checkouts on
   * the same stock.
   */
  async lockForStore(storeId: string, productIds: string[], ex: Executor): Promise<Inventory[]> {
    if (productIds.length === 0) return [];
    return ex
      .select()
      .from(inventory)
      .where(and(eq(inventory.storeId, storeId), inArray(inventory.productId, productIds)))
      .for('update');
  },

  /** Increment reserved quantity (hold stock during an active order). */
  async reserve(storeId: string, productId: string, qty: number, ex: Executor): Promise<void> {
    await ex
      .update(inventory)
      .set({ quantityReserved: sql`${inventory.quantityReserved} + ${qty}`, updatedAt: new Date() })
      .where(and(eq(inventory.storeId, storeId), eq(inventory.productId, productId)));
  },

  /** Release a reservation (order cancelled before fulfilment). */
  async release(storeId: string, productId: string, qty: number, ex: Executor): Promise<void> {
    await ex
      .update(inventory)
      .set({
        quantityReserved: sql`greatest(${inventory.quantityReserved} - ${qty}, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventory.storeId, storeId), eq(inventory.productId, productId)));
  },

  /** Convert a reservation into an actual stock deduction (order delivered). */
  async finalize(storeId: string, productId: string, qty: number, ex: Executor): Promise<void> {
    await ex
      .update(inventory)
      .set({
        quantityAvailable: sql`greatest(${inventory.quantityAvailable} - ${qty}, 0)`,
        quantityReserved: sql`greatest(${inventory.quantityReserved} - ${qty}, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventory.storeId, storeId), eq(inventory.productId, productId)));
  },

  /** Admin/ops absolute stock adjustment. */
  async setAvailable(storeId: string, productId: string, qty: number, ex: Executor = db): Promise<void> {
    await ex
      .update(inventory)
      .set({ quantityAvailable: qty, updatedAt: new Date() })
      .where(and(eq(inventory.storeId, storeId), eq(inventory.productId, productId)));
  },
};

/**
 * Available-to-sell = on-hand minus what's already reserved, and zero whenever
 * ops has suspended the line.
 *
 * The flag is applied *here* rather than at each call site because this is what
 * "sellable" means: the cart, the add-to-cart check and the order-placement
 * check at `order.service.ts` all route through this, so a suspended item is
 * refused at placement and not merely hidden from the listing. `availableExpr`
 * in `catalog.repository.ts` is the SQL mirror of this same rule.
 */
export const availableToSell = (
  row: Pick<Inventory, 'quantityAvailable' | 'quantityReserved' | 'isAvailable'>,
): number => (row.isAvailable ? Math.max(row.quantityAvailable - row.quantityReserved, 0) : 0);
