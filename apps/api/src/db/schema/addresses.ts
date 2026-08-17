import { boolean, doublePrecision, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { addressLabelEnum } from './enums';
import { users } from './users';

export const addresses = pgTable('addresses', {
  id: pk(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: addressLabelEnum().notNull().default('home'),
  line1: text().notNull(),
  line2: text(),
  area: text().notNull(),
  city: text().notNull(),
  latitude: doublePrecision().notNull(),
  longitude: doublePrecision().notNull(),
  notes: text(),
  isDefault: boolean().notNull().default(false),
  ...timestamps(),
});

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
