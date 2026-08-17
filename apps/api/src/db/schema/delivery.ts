import { boolean, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { deliveryStatusEnum } from './enums';
import { orders } from './orders';
import { users } from './users';

/** One assignment per order, tracking the rider's delivery workflow. */
export const deliveryAssignments = pgTable(
  'delivery_assignments',
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    riderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: deliveryStatusEnum().notNull().default('pending'),
    codCollected: boolean().notNull().default(false),
    /** COD amount to collect in paisa (null for prepaid orders). */
    codAmount: integer(),
    assignedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    pickedUpAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('delivery_assignments_order_uq').on(t.orderId)],
);

export type DeliveryAssignment = typeof deliveryAssignments.$inferSelect;
export type NewDeliveryAssignment = typeof deliveryAssignments.$inferInsert;
