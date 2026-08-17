import { boolean, doublePrecision, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';

/** Dark stores / fulfilment hubs. */
export const stores = pgTable(
  'stores',
  {
    id: pk(),
    name: text().notNull(),
    code: text().notNull(),
    addressLine: text().notNull(),
    area: text().notNull(),
    city: text().notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    deliveryRadiusMeters: integer().notNull().default(4000),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('stores_code_uq').on(t.code)],
);

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
