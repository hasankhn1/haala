import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import {
  type BrandDetailView,
  type BrandUserView,
  type BrandView,
  type BrandsQuery,
  type CreateBrandInput,
  type CreateBrandUserInput,
  UserRole,
  type UpdateBrandInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import { businessTypes, users } from '../../db/schema';
import { userRepository } from '../users/user.repository';
import { type BrandRow, brandRepository } from './brand.repository';

const SALT_ROUNDS = 10;

/**
 * Turn a display name into a URL-safe slug.
 *
 * Strips diacritics first so "Café Rosé" becomes `cafe-rose` rather than
 * losing the accented letters entirely and collapsing to `caf-ros`.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes vanish rather than becoming separators, so "Sarah's Bakery"
    // is `sarahs-bakery` and not `sarah-s-bakery`.
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A slug nobody else holds.
 *
 * Two brands called "Sarah's Bakery" is entirely plausible, so a taken slug is
 * a normal outcome, not an error to report — the second becomes `sarahs-bakery-2`.
 * The unique index is still the authority; this only avoids the common collision
 * so the operator is not asked to invent a slug by hand.
 */
async function availableSlug(base: string): Promise<string> {
  const root = slugify(base) || 'brand';
  if (!(await brandRepository.slugExists(root))) return root;
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await brandRepository.slugExists(candidate))) return candidate;
  }
  throw AppError.conflict(`Could not derive a free slug from "${base}"`);
}

const toView = (r: BrandRow): BrandView => ({
  id: r.brand.id,
  name: r.brand.name,
  slug: r.brand.slug,
  status: r.brand.status,
  description: r.brand.description,
  logoUrl: r.brand.logoUrl,
  coverUrl: r.brand.coverUrl,
  contactPhone: r.brand.contactPhone,
  contactEmail: r.brand.contactEmail,
  businessType: { id: r.typeId, key: r.typeKey, name: r.typeName },
  counts: { products: r.productCount, categories: r.categoryCount, users: r.userCount },
  createdAt: r.brand.createdAt.toISOString(),
});

const toUserView = (u: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
}): BrandUserView => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
});

async function resolveTypeId(key: string): Promise<string> {
  const [row] = await db
    .select({ id: businessTypes.id, isActive: businessTypes.isActive })
    .from(businessTypes)
    .where(eq(businessTypes.key, key))
    .limit(1);
  if (!row) throw AppError.badRequest(`No business type with key "${key}"`);
  if (!row.isActive) throw AppError.badRequest(`Business type "${key}" is not currently offered`);
  return row.id;
}

export const brandService = {
  async list(query: BrandsQuery): Promise<BrandView[]> {
    const rows = await brandRepository.list(query);
    return rows.map(toView);
  },

  async getById(id: string): Promise<BrandDetailView> {
    const row = await brandRepository.findById(id);
    if (!row) throw AppError.notFound('Brand not found');
    const userRows = await brandRepository.listUsers(id);
    return { ...toView(row), users: userRows.map(toUserView) };
  },

  async create(input: CreateBrandInput): Promise<BrandView> {
    const businessTypeId = await resolveTypeId(input.businessTypeKey);

    // An explicit slug is the operator's choice, so a clash there is a real
    // error to report rather than something to silently renumber.
    let slug: string;
    if (input.slug) {
      if (await brandRepository.slugExists(input.slug)) {
        throw AppError.conflict(`The slug "${input.slug}" is already taken`);
      }
      slug = input.slug;
    } else {
      slug = await availableSlug(input.name);
    }

    const brand = await brandRepository.create({
      name: input.name,
      slug,
      businessTypeId,
      status: input.status,
      description: input.description ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
    });

    const row = await brandRepository.findById(brand.id);
    if (!row) throw new Error('Brand vanished immediately after creation');
    return toView(row);
  },

  async update(id: string, input: UpdateBrandInput): Promise<BrandView> {
    const existing = await brandRepository.findById(id);
    if (!existing) throw AppError.notFound('Brand not found');

    const businessTypeId = input.businessTypeKey
      ? await resolveTypeId(input.businessTypeKey)
      : undefined;

    await brandRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(businessTypeId ? { businessTypeId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone ?? null } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail ?? null } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
    });

    const row = await brandRepository.findById(id);
    if (!row) throw AppError.notFound('Brand not found');
    return toView(row);
  },

  /**
   * Create a login for a brand.
   *
   * This is the **only** way a `brand_user` comes into existence: it is the one
   * path where a brand is in scope, and `users_brand_role_ck` rejects the role
   * without one. `adminCreateUserSchema` deliberately cannot mint this role.
   */
  async createUser(brandId: string, input: CreateBrandUserInput): Promise<BrandUserView> {
    const brand = await brandRepository.findById(brandId);
    if (!brand) throw AppError.notFound('Brand not found');

    if (await userRepository.findByPhone(input.phone)) {
      throw AppError.conflict('An account with this phone already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const [row] = await db
      .insert(users)
      .values({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        passwordHash,
        role: UserRole.BrandUser,
        brandId,
      })
      .returning();
    if (!row) throw new Error('Insert returned no user');
    return toUserView(row);
  },

  async setUserActive(brandId: string, userId: string, isActive: boolean): Promise<BrandUserView> {
    const updated = await brandRepository.setUserActive(brandId, userId, isActive);
    // 404 rather than 403: confirming the user exists but belongs to another
    // brand is itself a disclosure.
    if (!updated) throw AppError.notFound('User not found for this brand');

    const rows = await brandRepository.listUsers(brandId);
    const found = rows.find((u) => u.id === userId);
    if (!found) throw AppError.notFound('User not found for this brand');
    return toUserView(found);
  },
};
