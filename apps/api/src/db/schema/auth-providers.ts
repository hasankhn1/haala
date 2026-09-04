import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { authProviderEnum } from './enums';
import { users } from './users';

/**
 * The ways one customer can prove who they are.
 *
 * Identity used to be a single column: `users.phone`, plus a password. That
 * works until a customer wants to arrive via Google, or via an email address,
 * and it makes "the same person signing in a different way" indistinguishable
 * from "a new person".
 *
 * A row here is one verified route to one canonical `userId`. Signing in with
 * Google resolves through `(provider, providerUserId)` to the customer who
 * already exists — which is the whole reason duplicate accounts do not appear.
 *
 * **`providerUserId` must come from the provider, never the client.** Google's
 * `sub` is trusted because Google signed the token it arrived in; an email
 * address typed into a form proves nothing and must not be used to link
 * anything.
 *
 * `phone` is in the enum because today's phone+password login is one provider
 * among several rather than a separate concept — and because it leaves the slot
 * for phone OTP later without anything downstream needing to know.
 */
export const authProviders = pgTable(
  'auth_providers',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum().notNull(),
    /**
     * The provider's own stable id for this person: Google's `sub`, Apple's
     * `sub`, or the email/phone for our own two. Never a display name or
     * anything else the user can change.
     */
    providerUserId: text().notNull(),
    ...timestamps(),
  },
  (t) => [
    /**
     * One identity belongs to one customer. This is the index that makes
     * duplicate accounts impossible rather than merely unlikely: a second
     * attempt to attach the same Google `sub` to a different user fails here.
     */
    uniqueIndex('auth_providers_identity_uq').on(t.provider, t.providerUserId),
    /** And one customer has at most one identity per provider. */
    uniqueIndex('auth_providers_user_provider_uq').on(t.userId, t.provider),
  ],
);

export type AuthProvider = typeof authProviders.$inferSelect;
export type NewAuthProvider = typeof authProviders.$inferInsert;
