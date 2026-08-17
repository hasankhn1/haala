import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { promotionTypeEnum } from './enums';

export const promotions = pgTable(
  'promotions',
  {
    id: pk(),
    code: text().notNull(),
    type: promotionTypeEnum().notNull(),
    /** For percentage: basis points-free percent (e.g. 10 = 10%). For fixed: paisa. */
    value: integer().notNull().default(0),
    minOrderTotal: integer(),
    maxDiscount: integer(),
    usageLimit: integer(),
    usedCount: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('promotions_code_uq').on(t.code)],
);

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;
