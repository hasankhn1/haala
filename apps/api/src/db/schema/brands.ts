import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';
import { businessTypes } from './business-types';
import { brandStatusEnum } from './enums';

/**
 * A business selling on the platform — "Sarah's Bakery", "Ahmed Fashion".
 *
 * A brand owns **product definitions**, not stock. Haala takes physical custody
 * of everything in its dark stores, so `inventory` stays keyed by store and
 * variant and is edited by ops, never by the brand. What a brand controls is
 * what the thing *is* and whether it is on sale at all: name, description,
 * photos, price, categories, and `products.isActive`.
 *
 * `status` gates selling. A brand that is not `active` keeps its catalogue but
 * disappears from the customer app — which is what makes suspension a real
 * lever rather than a label.
 *
 * The house brand seeded by migration 0008 owns every product that existed
 * before brands did, which is what let `products.brand_id` be NOT NULL rather
 * than carrying a nullable "belongs to Haala itself" special case through every
 * isolation query forever.
 */
export const brands = pgTable(
  'brands',
  {
    id: pk(),
    name: text().notNull(),
    /** URL-safe identity, unique across the platform. */
    slug: text().notNull(),
    businessTypeId: uuid()
      .notNull()
      .references(() => businessTypes.id, { onDelete: 'restrict' }),
    status: brandStatusEnum().notNull().default('pending'),
    description: text(),
    logoUrl: text(),
    coverUrl: text(),
    contactPhone: text(),
    contactEmail: text(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('brands_slug_uq').on(t.slug)],
);

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
