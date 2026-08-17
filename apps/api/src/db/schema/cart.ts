import { integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { products } from './catalog';
import { stores } from './stores';
import { users } from './users';

export const carts = pgTable(
  'carts',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid().references(() => stores.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('carts_user_uq').on(t.userId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: pk(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer().notNull().default(1),
    /** Price snapshot in paisa at time of add. */
    unitPrice: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('cart_items_cart_product_uq').on(t.cartId, t.productId)],
);

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
