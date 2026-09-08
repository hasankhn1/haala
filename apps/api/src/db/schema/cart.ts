import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { productVariants } from './variants';
import { stores } from './stores';
import { users } from './users';

export const carts = pgTable(
  'carts',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Which department this basket belongs to — one basket per department.
     *
     * A customer buying rice and a shirt has two baskets, and they check out
     * separately: an order is dispatched from one shop, and a single order
     * spanning a dark store and a boutique is not a thing that can be picked.
     *
     * Plain text rather than a foreign key to `business_types`, matching
     * `home_banners`: a basket must survive a department being renamed or
     * switched off, and the alternative is a cascade that empties baskets.
     *
     * **Derived from what is added, never sent by the client.** The department
     * is a property of the variant's brand, so trusting a body field would let
     * a caller drop a shirt into the grocery basket and break the guarantee
     * this column exists to make.
     */
    departmentKey: text().notNull(),
    storeId: uuid().references(() => stores.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  // One basket per department per customer — replacing the one-per-customer
  // index. `addItem` upserts on this, so the pair must stay unique.
  (t) => [uniqueIndex('carts_user_department_uq').on(t.userId, t.departmentKey)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: pk(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer().notNull().default(1),
    /** Price snapshot in paisa at time of add. */
    unitPrice: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('cart_items_cart_variant_uq').on(t.cartId, t.variantId)],
);

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
