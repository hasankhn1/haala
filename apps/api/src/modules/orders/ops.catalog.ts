import { and, asc, eq } from 'drizzle-orm';
import type {
  CreateStoreInput,
  OpsCatalogRow,
  OpsStoreView,
  UpdateInventoryInput,
  UpdateProductInput,
  UpdateStoreInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { db } from '../../db/client';
import { categories, inventory, products, stores } from '../../db/schema';
import { availableToSell } from '../inventory/inventory.repository';

/**
 * Catalogue administration for the ops dashboard.
 *
 * Kept beside the other ops surfaces rather than inside `catalog`, because that
 * module is the customer-facing read model and this is the operator write
 * model — different audience, different authorisation, different shape.
 */
const toStoreView = (s: typeof stores.$inferSelect): OpsStoreView => ({
  id: s.id,
  name: s.name,
  code: s.code,
  addressLine: s.addressLine,
  area: s.area,
  city: s.city,
  latitude: s.latitude,
  longitude: s.longitude,
  deliveryRadiusMeters: s.deliveryRadiusMeters,
  isActive: s.isActive,
});

export const opsCatalogService = {
  /** All stores, including inactive ones — ops needs to see what it disabled. */
  async listStores(): Promise<OpsStoreView[]> {
    const rows = await db.select().from(stores).orderBy(asc(stores.name));
    return rows.map(toStoreView);
  },

  async createStore(input: CreateStoreInput): Promise<OpsStoreView> {
    const clash = await db.select().from(stores).where(eq(stores.code, input.code)).limit(1);
    if (clash.length > 0)
      throw AppError.conflict(`A store with code "${input.code}" already exists`);
    const [row] = await db.insert(stores).values(input).returning();
    logger.info({ storeId: row!.id, code: input.code }, 'Store created by ops');
    return toStoreView(row!);
  },

  /**
   * Update a store. `code` is deliberately not updatable — riders, orders and
   * the seed all refer to stores by it.
   */
  async updateStore(id: string, input: UpdateStoreInput): Promise<OpsStoreView> {
    const [row] = await db
      .update(stores)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    if (!row) throw AppError.notFound('Store not found');
    logger.info({ storeId: id, fields: Object.keys(input) }, 'Store updated by ops');
    return toStoreView(row);
  },

  /**
   * The pricing table: every product joined to its stock at one store.
   * A left join keeps products with no inventory row visible — otherwise a
   * newly added product would be invisible in the very screen used to stock it.
   */
  async catalogForStore(storeId: string): Promise<OpsCatalogRow[]> {
    const rows = await db
      .select({ product: products, category: categories, inv: inventory })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(
        inventory,
        and(eq(inventory.productId, products.id), eq(inventory.storeId, storeId)),
      )
      .orderBy(asc(categories.sortOrder), asc(products.name));

    return rows.map(({ product, category, inv }) => {
      const storePrice = inv?.price ?? null;
      return {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.unit,
        categoryId: category.id,
        categoryName: category.name,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        basePrice: product.basePrice,
        storePrice,
        effectivePrice: storePrice ?? product.basePrice,
        quantityAvailable: inv?.quantityAvailable ?? 0,
        quantityReserved: inv?.quantityReserved ?? 0,
        // A product with no inventory row yet is treated as available: the
        // operator has simply not stocked it, not suspended it.
        isAvailable: inv?.isAvailable ?? true,
        availableToSell: inv ? availableToSell(inv) : 0,
      };
    });
  },

  async updateProduct(productId: string, input: UpdateProductInput): Promise<OpsCatalogRow | null> {
    const [updated] = await db
      .update(products)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();
    if (!updated) throw AppError.notFound('Product not found');
    logger.info({ productId, fields: Object.keys(input) }, 'Product updated by ops');
    return null;
  },

  /**
   * Set stock or a price override for one product at one store. Upserts,
   * because a product that has never been stocked at this store has no
   * inventory row yet and stocking it is exactly what an operator is doing.
   */
  async updateInventory(
    storeId: string,
    productId: string,
    input: UpdateInventoryInput,
  ): Promise<void> {
    const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    if (store.length === 0) throw AppError.notFound('Store not found');
    const product = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (product.length === 0) throw AppError.notFound('Product not found');

    await db
      .insert(inventory)
      .values({
        storeId,
        productId,
        quantityAvailable: input.quantityAvailable ?? 0,
        isAvailable: input.isAvailable ?? true,
        price: input.price ?? null,
      })
      .onConflictDoUpdate({
        target: [inventory.storeId, inventory.productId],
        // Only overwrite what was actually sent, so editing the price doesn't
        // silently reset stock to zero.
        set: {
          ...(input.quantityAvailable !== undefined
            ? { quantityAvailable: input.quantityAvailable }
            : {}),
          ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          updatedAt: new Date(),
        },
      });
    logger.info({ storeId, productId, fields: Object.keys(input) }, 'Inventory updated by ops');
  },
};
