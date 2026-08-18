import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk } from './_helpers';
import { users } from './users';

/**
 * Expo push tokens, one row per device.
 *
 * The unique index is on the token alone, not on (user, token): a token
 * identifies a *device*, so when a second person signs in on the same handset
 * the row must move to them rather than duplicate — otherwise the previous
 * user keeps receiving order notifications on a phone they no longer hold.
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    /** "ios" | "android" — informational, for debugging delivery failures. */
    platform: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('push_tokens_token_uq').on(t.token)],
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
