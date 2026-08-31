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
    phone: text().notNull(),
    email: text(),
    passwordHash: text().notNull(),
    role: userRoleEnum().notNull().default('customer'),
    /**
     * The brand this login belongs to. Set for — and only for — `brand_user`.
     * It is the tenant key every brand-scoped query filters on, and it is read
     * into the access token at login so the common path costs no extra query.
     */
    brandId: uuid().references(() => brands.id, { onDelete: 'restrict' }),
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
