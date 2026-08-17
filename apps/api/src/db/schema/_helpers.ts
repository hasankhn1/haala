import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** Fresh UUID primary key column (gen_random_uuid()). */
export const pk = () => uuid().primaryKey().defaultRandom();

/** Standard created/updated timestamps. Spread with `...timestamps()`. */
export const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
