import { asc, count, eq, sql } from 'drizzle-orm';
import {
  type BusinessTypeView,
  type CreateBusinessTypeInput,
  type UpdateBusinessTypeInput,
  businessTypeSpecs,
  isBusinessTypeKey,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import { type BusinessType, brands, businessTypes } from '../../db/schema';

/**
 * Business types: what kinds of business the platform sells for.
 *
 * The database row and the code registry are two halves of one thing. The row
 * gives a type an id to reference and an on/off switch the super admin controls
 * without a deploy; `businessTypeSpecs` gives it validated product fields. A row
 * without a matching spec is legal but crippled — brands on it cannot save
 * product attributes — so `hasSpec` surfaces that instead of leaving it to be
 * discovered when a vendor's form silently rejects everything.
 */
const toView = (t: BusinessType & { brandCount: number }): BusinessTypeView => {
  const spec = isBusinessTypeKey(t.key) ? businessTypeSpecs[t.key] : null;
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    brandCount: t.brandCount,
    hasSpec: spec !== null,
    fields: spec?.fields ?? [],
    variantNoun: spec?.variantNoun ?? null,
  };
};

export const businessTypeService = {
  async list(): Promise<BusinessTypeView[]> {
    const rows = await db
      .select({
        id: businessTypes.id,
        key: businessTypes.key,
        name: businessTypes.name,
        sortOrder: businessTypes.sortOrder,
        isActive: businessTypes.isActive,
        createdAt: businessTypes.createdAt,
        updatedAt: businessTypes.updatedAt,
        // One one-to-many join, so a plain GROUP BY counts correctly and there
        // is no correlated subquery to get the qualification wrong in.
        brandCount: sql<number>`count(${brands.id})::int`,
      })
      .from(businessTypes)
      .leftJoin(brands, eq(brands.businessTypeId, businessTypes.id))
      .groupBy(businessTypes.id)
      .orderBy(asc(businessTypes.sortOrder), asc(businessTypes.name));
    return rows.map(toView);
  },

  async create(input: CreateBusinessTypeInput): Promise<BusinessTypeView> {
    const [existing] = await db
      .select({ n: count() })
      .from(businessTypes)
      .where(eq(businessTypes.key, input.key))
      .limit(1);
    if ((existing?.n ?? 0) > 0) {
      throw AppError.conflict(`A business type with key "${input.key}" already exists`);
    }

    const [row] = await db
      .insert(businessTypes)
      .values({
        key: input.key,
        name: input.name,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      .returning();
    if (!row) throw new Error('Insert returned no business type');
    return toView({ ...row, brandCount: 0 });
  },

  async update(id: string, input: UpdateBusinessTypeInput): Promise<BusinessTypeView> {
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(brands)
      .where(eq(brands.businessTypeId, id));

    // Refused up front rather than written and undone: disabling a type in use
    // would strand its brands with no way to edit products, and a write we
    // intend to reverse is one a concurrent reader can still observe.
    if (input.isActive === false && n > 0) {
      throw AppError.conflict(
        `${n} brand${n === 1 ? '' : 's'} still use this type — move them before disabling it`,
      );
    }

    const [row] = await db
      .update(businessTypes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(businessTypes.id, id))
      .returning();
    if (!row) throw AppError.notFound('Business type not found');

    return toView({ ...row, brandCount: n });
  },
};
