import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { orderStatusEnum, paymentMethodEnum } from './enums';
import { products } from './catalog';
import { stores } from './stores';
import { users } from './users';

/** Denormalised address captured at order time (source address may change/delete). */
export interface AddressSnapshot {
  label: string;
  line1: string;
  line2?: string | null;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export const orders = pgTable(
  'orders',
  {
    id: pk(),
    /** Human-friendly, e.g. HAALA-2XK4Q. */
    orderNumber: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    riderId: uuid().references(() => users.id, { onDelete: 'set null' }),
    status: orderStatusEnum().notNull().default('placed'),
    paymentMethod: paymentMethodEnum().notNull(),

    // Money, all paisa.
    subtotal: integer().notNull(),
    deliveryFee: integer().notNull().default(0),
    discount: integer().notNull().default(0),
    total: integer().notNull(),

    /**
     * Snapshot of the promo code applied, alongside the other order-time
     * snapshots in this table. The authoritative promotion → order link lives
     * in `promotion_redemptions`; this is here so a receipt renders without a
     * join and still reads correctly if the promotion is later deleted.
     */
    promoCode: text(),

    deliveryAddress: jsonb().$type<AddressSnapshot>().notNull(),
    notes: text(),
    /** Guards against duplicate order creation on retry. */
    idempotencyKey: text(),

    placedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('orders_number_uq').on(t.orderNumber),
    uniqueIndex('orders_idempotency_uq').on(t.idempotencyKey),
  ],
);

export const orderItems = pgTable('order_items', {
  id: pk(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid()
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Snapshots so historical orders render correctly even if the product changes.
  name: text().notNull(),
  unit: text().notNull(),
  quantity: integer().notNull(),
  unitPrice: integer().notNull(),
  lineTotal: integer().notNull(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: pk(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  status: orderStatusEnum().notNull(),
  note: text(),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderStatusHistoryRow = typeof orderStatusHistory.$inferSelect;
