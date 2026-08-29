import { boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { products } from './catalog';

/**
 * A sellable size of a product — "500 g", "1 kg".
 *
 * The comps sell by size, and a size is not a display detail: 500g and 1kg are
 * separately priced and separately stocked, so the variant — not the product —
 * is the thing inventory counts and a basket holds.
 *
 * **Every product has at least one.** The migration backfills a default variant
 * per product from its existing `unit` and `basePrice`, which is what lets
 * `inventory.variantId` and `cart_items.variantId` be NOT NULL rather than
 * carrying a nullable special case through the order transaction forever.
 *
 * `products.basePrice` and `products.unit` survive as the catalogue-level
 * defaults used when creating a variant and for the historical snapshot on
 * `order_items`.
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: pk(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Shown on the "Pick a size" cards, e.g. "500 g". */
    label: text().notNull(),
    /** The sellable unit, used for the per-unit price line. */
    unit: text().notNull(),
    basePrice: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('product_variants_product_label_uq').on(t.productId, t.label)],
);

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
