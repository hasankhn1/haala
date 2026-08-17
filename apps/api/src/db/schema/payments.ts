import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { paymentMethodEnum, paymentStatusEnum } from './enums';
import { orders } from './orders';

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum().notNull(),
    /** Provider key, e.g. "cod", "stub", "safepay". */
    provider: text().notNull(),
    status: paymentStatusEnum().notNull().default('pending'),
    amount: integer().notNull(),
    currency: text().notNull().default('PKR'),
    /** Gateway transaction reference. */
    providerRef: text(),
    /** Idempotency for create/verify — one payment per key. */
    idempotencyKey: text(),
    /** Raw provider payload (webhooks etc.) for audit; never card data. */
    rawPayload: jsonb(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('payments_idempotency_uq').on(t.idempotencyKey)],
);

export const refunds = pgTable('refunds', {
  id: pk(),
  paymentId: uuid()
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  amount: integer().notNull(),
  status: text().notNull().default('pending'),
  providerRef: text(),
  reason: text(),
  ...timestamps(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
