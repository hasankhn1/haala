import { boolean, index, integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { products } from './catalog';

/**
 * "Popular right now" on the marketplace home — the products ops has chosen.
 *
 * This replaced an automatic ranking that sorted the first hundred products by
 * discount depth. That was honest about what it was, but it gave ops no say in
 * the most valuable strip of the app, and its coverage across categories was a
 * side effect of whichever rows happened to fall in the scan.
 *
 * **The list is exclusive.** What is here is what the customer sees, in this
 * order, and nothing else. There is no automatic top-up: a section that quietly
 * fills itself back up would make a deliberate removal look broken.
 *
 * **Not scoped to a store or a department**, and both omissions are deliberate.
 * Featuring a product is an editorial decision about the marketplace; whether a
 * given dark store can actually sell it is a stock question, answered at read
 * time by the same joins the catalogue uses. Two stores legitimately show
 * different subsets of one curated list.
 *
 * `product_id` is a real foreign key, unlike `home_banners.department_key` —
 * the opposite call, for the opposite reason. A banner is artwork that should
 * outlive the thing it points at; a feature is a pointer to a specific row and
 * is meaningless once that row is gone.
 */
export const homeProducts = pgTable(
  'home_products',
  {
    id: pk(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Off without losing the choice — same affordance as a banner. */
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    // A product is featured once or not at all. The dashboard's "add" upserts on
    // this rather than checking first.
    uniqueIndex('home_products_product_uq').on(t.productId),
    // The home endpoint reads exactly this: active features in order.
    index('home_products_active_order_idx').on(t.isActive, t.sortOrder),
  ],
);

export type HomeProduct = typeof homeProducts.$inferSelect;
export type NewHomeProduct = typeof homeProducts.$inferInsert;
