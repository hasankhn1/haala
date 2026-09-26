import { boolean, pgTable, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { users } from './users';

/**
 * Which notifications a customer wants pushed to their phone.
 *
 * One row per user, written the first time they change anything — until then
 * the column defaults *are* their preferences, and the service reads a missing
 * row as exactly that. The inbox is not gated by any of this: a muted category
 * still lands in the inbox, it just doesn't buzz.
 *
 * Offers default off, per the design: nobody opted into marketing by placing an
 * order.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderUpdates: boolean().notNull().default(true),
  brandOrders: boolean().notNull().default(true),
  payments: boolean().notNull().default(true),
  offers: boolean().notNull().default(false),
  service: boolean().notNull().default(true),
  quietHours: boolean().notNull().default(true),
  ...timestamps(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;
