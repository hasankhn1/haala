import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { promotionTypeEnum } from './enums';
import { orders } from './orders';
import { users } from './users';

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
    /** Total redemptions allowed across all customers. Null = unlimited. */
    usageLimit: integer(),
    /**
     * Redemptions allowed per customer. Null = unlimited. A launch offer is
     * `perUserLimit: 1` — `usedCount` alone cannot express that, which is why
     * redemptions are tracked as rows below.
     */
    perUserLimit: integer(),
    usedCount: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('promotions_code_uq').on(t.code)],
);

/**
 * One row per (promotion, order). Per-user limits are enforced by counting
 * these, not by the `usedCount` aggregate — without them a customer could
 * cancel and reorder to farm a first-order discount indefinitely.
 *
 * Cascades on order delete; the order is the thing that gives a redemption
 * meaning.
 */
export const promotionRedemptions = pgTable(
  'promotion_redemptions',
  {
    id: pk(),
    promotionId: uuid()
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Paisa actually taken off, for auditing a receipt after the fact. */
    discount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('promotion_redemptions_order_uq').on(t.promotionId, t.orderId)],
);

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;
export type PromotionRedemption = typeof promotionRedemptions.$inferSelect;
export type NewPromotionRedemption = typeof promotionRedemptions.$inferInsert;
