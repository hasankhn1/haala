import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pk } from './_helpers';
import { users } from './users';

export const notifications = pgTable('notifications', {
  id: pk(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  body: text().notNull(),
  /** e.g. "order_update", "promo", "system". */
  type: text().notNull().default('system'),
  data: jsonb(),
  readAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
