import { boolean, doublePrecision, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';

export interface StorePolygonPoint {
  lat: number;
  lng: number;
}

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
    /**
     * Precise delivery boundary, when the delivery area's real shape doesn't
     * fit a circle (e.g. DHA Peshawar). Null means "not drawn yet" — falls
     * back to `deliveryRadiusMeters`. See `isWithinDeliveryRadius`.
     */
    polygon: jsonb().$type<StorePolygonPoint[] | null>(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('stores_code_uq').on(t.code)],
);

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
