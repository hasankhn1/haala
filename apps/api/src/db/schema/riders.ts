import { doublePrecision, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { riderAvailabilityEnum } from './enums';
import { stores } from './stores';
import { users } from './users';

/** Rider profile — extends a user whose role is `rider`. */
export const riders = pgTable(
  'riders',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Home dark store. Riders wait at and collect from one store, so this is
     * what scopes the orders they're offered. Nullable: a rider without one
     * falls back to proximity from their last known position.
     */
    storeId: uuid().references(() => stores.id, { onDelete: 'set null' }),
    availability: riderAvailabilityEnum().notNull().default('offline'),
    vehicleType: text(),
    currentLat: doublePrecision(),
    currentLng: doublePrecision(),
    lastSeenAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('riders_user_uq').on(t.userId)],
);

export type Rider = typeof riders.$inferSelect;
export type NewRider = typeof riders.$inferInsert;
