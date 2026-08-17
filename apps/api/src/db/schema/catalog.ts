import { boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';

export const categories = pgTable(
  'categories',
  {
    id: pk(),
    name: text().notNull(),
    slug: text().notNull(),
    imageUrl: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('categories_slug_uq').on(t.slug)],
);

export const products = pgTable(
  'products',
  {
    id: pk(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    imageUrl: text(),
    /** Display unit, e.g. "1 L", "500 g", "6 pcs". */
    unit: text().notNull(),
    /** Base price in paisa (integer minor units). */
    basePrice: integer().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('products_slug_uq').on(t.slug)],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
