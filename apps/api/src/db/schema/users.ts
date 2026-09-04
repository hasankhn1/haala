import { boolean, check, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, timestamps } from './_helpers';
import { brands } from './brands';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: pk(),
    name: text().notNull(),
    /**
     * Identity for accounts created the original way, and **nullable** since
     * email-first signups have no phone at all. A unique index tolerates
     * repeated NULLs, so `users_phone_uq` still holds for those that have one.
     *
     * This is no longer the only way in — see `auth_providers`. It is also not
     * the delivery contact: that is `deliveryPhone` below, and conflating the
     * two is what made "change my number" mean "change my login".
     */
    phone: text(),
    email: text(),
    passwordHash: text().notNull(),
    role: userRoleEnum().notNull().default('customer'),
    /**
     * The brand this login belongs to. Set for — and only for — `brand_user`.
     * It is the tenant key every brand-scoped query filters on, and it is read
     * into the access token at login so the common path costs no extra query.
     */
    brandId: uuid().references(() => brands.id, { onDelete: 'restrict' }),
    /**
     * The number a rider calls at the door. Deliberately separate from
     * identity: a customer may change it freely, it is not unique, and someone
     * who signed in with Google has one without it ever being a credential.
     *
     * E.164, validated against `phoneSchema` server-side.
     */
    deliveryPhone: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phone),
    uniqueIndex('users_email_uq').on(t.email),
    /**
     * The tenancy invariant, stated where it cannot be bypassed: a brand user
     * always has a brand, and nobody else ever does. Application code that
     * forgot to set `brandId` when creating a brand login, or that left it
     * behind when demoting one, fails here instead of producing an account
     * whose scope is undefined.
     */
    check(
      'users_brand_role_ck',
      sql`(${t.role} = 'brand_user') = (${t.brandId} IS NOT NULL)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
