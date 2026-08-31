import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { BrandStatus } from '@haala/shared';
import { db } from '../../db/client';
import {
  type Brand,
  type NewBrand,
  brands,
  businessTypes,
  categories,
  products,
  users,
} from '../../db/schema';

/** A brand row joined to its type, plus the counts the list page shows. */
export interface BrandRow {
  brand: Brand;
  typeId: string;
  typeKey: string;
  typeName: string;
  productCount: number;
  categoryCount: number;
  userCount: number;
}

/**
 * Counting in the same statement rather than N+1 per brand.
 *
 * Correlated subqueries instead of joins because three independent one-to-many
 * joins would multiply each other's rows — a brand with 3 categories and 40
 * products would report 120 of each.
 *
 * **Written without `${}` interpolation on purpose.** Drizzle only qualifies
 * column names when the outer query has a join; on a single-table select the
 * same template renders as `where "brand_id" = "id"`, which resolves entirely
 * inside the subquery and compares `products.brand_id` to `products.id`. That
 * is always false, so the count silently becomes 0 rather than failing. Writing
 * the qualification by hand makes these immune to how the outer query is built.
 */
const countsSelect = {
  productCount: sql<number>`(select count(*)::int from products where products.brand_id = brands.id)`,
  categoryCount: sql<number>`(select count(*)::int from categories where categories.brand_id = brands.id)`,
  userCount: sql<number>`(select count(*)::int from users where users.brand_id = brands.id)`,
};

const baseSelect = {
  brand: brands,
  typeId: businessTypes.id,
  typeKey: businessTypes.key,
  typeName: businessTypes.name,
  ...countsSelect,
};

export const brandRepository = {
  async list(filter: { status?: BrandStatus; q?: string }): Promise<BrandRow[]> {
    const where = [
      filter.status ? eq(brands.status, filter.status) : undefined,
      filter.q
        ? or(ilike(brands.name, `%${filter.q}%`), ilike(brands.slug, `%${filter.q}%`))
        : undefined,
    ].filter(Boolean);

    return db
      .select(baseSelect)
      .from(brands)
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(brands.name));
  },

  async findById(id: string): Promise<BrandRow | null> {
    const [row] = await db
      .select(baseSelect)
      .from(brands)
      .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
      .where(eq(brands.id, id))
      .limit(1);
    return row ?? null;
  },

  async slugExists(slug: string): Promise<boolean> {
    const [row] = await db
      .select({ n: count() })
      .from(brands)
      .where(eq(brands.slug, slug))
      .limit(1);
    return (row?.n ?? 0) > 0;
  },

  async create(value: NewBrand): Promise<Brand> {
    const [row] = await db.insert(brands).values(value).returning();
    if (!row) throw new Error('Insert returned no brand');
    return row;
  },

  async update(id: string, patch: Partial<NewBrand>): Promise<Brand | null> {
    const [row] = await db
      .update(brands)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();
    return row ?? null;
  },

  /** Logins belonging to one brand, oldest first. */
  async listUsers(brandId: string) {
    return db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.brandId, brandId))
      .orderBy(asc(users.createdAt));
  },

  /**
   * Every brand login on the platform, newest first, with the shop attached.
   *
   * Sorted newest-first rather than by brand: the row someone is looking for is
   * almost always the one they just made.
   */
  async listAllUsers() {
    return db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        isActive: users.isActive,
        createdAt: users.createdAt,
        brandId: brands.id,
        brandName: brands.name,
        brandSlug: brands.slug,
        brandStatus: brands.status,
      })
      .from(users)
      .innerJoin(brands, eq(brands.id, users.brandId))
      .orderBy(desc(users.createdAt));
  },

  /**
   * Takes `brandId` separately from the patch so a caller cannot accidentally
   * address a user outside the brand it is administering — the brand is part of
   * the WHERE, not something the update trusts from elsewhere.
   */
  async setUserActive(brandId: string, userId: string, isActive: boolean) {
    const [row] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.brandId, brandId)))
      .returning({ id: users.id });
    return row ?? null;
  },
};
