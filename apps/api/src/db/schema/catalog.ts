import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { brands } from './brands';

/**
 * A brand's own category, e.g. Sarah's "Cakes" or Ahmed's "Men".
 *
 * Categories are **per brand**, not global. Two bakeries both wanting a `cakes`
 * slug is the normal case, not a conflict, which is why the unique index is on
 * `(brandId, slug)` rather than `slug` alone.
 */
export const categories = pgTable(
  'categories',
  {
    id: pk(),
    brandId: uuid()
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    slug: text().notNull(),
    imageUrl: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('categories_brand_slug_uq').on(t.brandId, t.slug)],
);

export const products = pgTable(
  'products',
  {
    id: pk(),
    /**
     * Denormalised from `categories.brandId` on purpose. Every isolation check
     * filters products directly, and requiring a join to prove ownership is how
     * a query eventually gets written without one.
     */
    brandId: uuid()
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    imageUrl: text(),
    /** Display unit, e.g. "1 L", "500 g", "6 pcs". */
    unit: text().notNull(),
    /** Base price in paisa (integer minor units). What the customer is charged. */
    basePrice: integer().notNull(),
    /**
     * The higher "was" price, struck through beside `basePrice`. Optional, and
     * never what is charged — `order_items` snapshots `basePrice`, so the two
     * must not be swapped to express a discount.
     */
    compareAtPrice: integer(),
    /** The brand's own reference. Unique per brand when present, not global. */
    sku: text(),
    /**
     * Business-type-specific fields — a bakery's ingredients, a clothing item's
     * material. Validated against the zod schema in `businessTypeSpecs` for the
     * owning brand's type before it is written, so this is only loosely typed
     * at the storage layer, never at the boundary.
     */
    attributes: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('products_brand_slug_uq').on(t.brandId, t.slug),
    uniqueIndex('products_brand_sku_uq').on(t.brandId, t.sku),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
