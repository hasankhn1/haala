import { boolean, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';

/**
 * The kinds of business the platform sells for — bakery, clothing, produce.
 *
 * A row here is *identity and enablement*: it gives a type a stable id to
 * reference, a display name, and an on/off switch the super admin controls
 * without a deploy.
 *
 * What a row deliberately does **not** carry is the shape of the type's extra
 * product fields. That lives in `businessTypeSpecs` in `@haala/shared`, keyed by
 * this table's `key`, because those fields are validated with zod on the way in
 * and rendered as a typed form on the way out — neither of which survives being
 * an untyped JSON blob in a database row. Adding a type is one registry entry
 * plus one row here; it needs a deploy, and that is the price of the product
 * form being type-checked rather than interpreted.
 */
export const businessTypes = pgTable(
  'business_types',
  {
    id: pk(),
    /** Stable machine key, and the join to `businessTypeSpecs`. e.g. "bakery". */
    key: text().notNull(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex('business_types_key_uq').on(t.key)],
);

export type BusinessType = typeof businessTypes.$inferSelect;
export type NewBusinessType = typeof businessTypes.$inferInsert;
