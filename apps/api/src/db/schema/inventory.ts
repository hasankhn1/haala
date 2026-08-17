import { integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { products } from './catalog';
import { stores } from './stores';

/**
 * Per-store stock. `quantityReserved` is held during checkout so two customers
 * can't buy the last unit; available-to-sell = quantityAvailable - quantityReserved.
 * `price` overrides the product base price for this store when set.
 */
export const inventory = pgTable(
  'inventory',
  {
    id: uuid().primaryKey().defaultRandom(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantityAvailable: integer().notNull().default(0),
    quantityReserved: integer().notNull().default(0),
    price: integer(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('inventory_store_product_uq').on(t.storeId, t.productId)],
);

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;
