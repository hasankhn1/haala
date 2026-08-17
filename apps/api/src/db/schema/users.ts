import { boolean, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: pk(),
    name: text().notNull(),
    phone: text().notNull(),
    email: text(),
    passwordHash: text().notNull(),
    role: userRoleEnum().notNull().default('customer'),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phone),
    uniqueIndex('users_email_uq').on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
