import { z } from 'zod';
import { BrandStatus } from '../enums';
import { phoneSchema } from './auth';

/**
 * Brand administration — the super admin's surface.
 *
 * A brand is created by Haala, not by the business itself, so there is no
 * public application schema here. `status` still ships from the start, which is
 * what makes adding an apply-and-approve flow later a UI change rather than a
 * migration.
 */

const brandStatusValues = [
  BrandStatus.Pending,
  BrandStatus.Active,
  BrandStatus.Suspended,
  BrandStatus.Rejected,
] as const;

export const createBrandSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    /** Matches `business_types.key`. */
    businessTypeKey: z.string().trim().min(2).max(40),
    /** Derived from the name when omitted; must stay unique platform-wide. */
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and hyphens')
      .optional(),
    status: z.enum(brandStatusValues).default(BrandStatus.Active),
    description: z.string().trim().max(600).optional(),
    contactPhone: phoneSchema.optional(),
    contactEmail: z.string().email().max(160).optional(),
  })
  .strict();
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = createBrandSchema
  .partial()
  // The slug is in customer-facing URLs; changing it silently breaks links, so
  // it is set once at creation and not editable here.
  .omit({ slug: true })
  .extend({
    logoUrl: z.string().url().max(600).nullable().optional(),
    coverUrl: z.string().url().max(600).nullable().optional(),
  })
  .strict();
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/** Credentials for a brand's own login. The brand comes from the path. */
export const createBrandUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: phoneSchema,
    email: z.string().email().max(160).optional(),
    password: z.string().min(8).max(128),
  })
  .strict();
export type CreateBrandUserInput = z.infer<typeof createBrandUserSchema>;

export const setUserActiveSchema = z.object({ isActive: z.boolean() }).strict();
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export const brandsQuerySchema = z
  .object({
    status: z.enum(brandStatusValues).optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();
export type BrandsQuery = z.infer<typeof brandsQuerySchema>;

export interface BrandBusinessTypeView {
  id: string;
  key: string;
  name: string;
}

export interface BrandUserView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BrandView {
  id: string;
  name: string;
  slug: string;
  status: BrandStatus;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  businessType: BrandBusinessTypeView;
  /** What the brand has in it — the list page's at-a-glance column. */
  counts: { products: number; categories: number; users: number };
  createdAt: string;
}

/**
 * A brand login seen from the platform side, i.e. carrying the shop it belongs
 * to. The per-brand view omits that, because there the brand is the page.
 */
export interface BrandUserRow extends BrandUserView {
  brand: { id: string; name: string; slug: string; status: BrandStatus };
}

/** Brand detail, with its logins. Only the super admin ever sees this. */
export interface BrandDetailView extends BrandView {
  users: BrandUserView[];
}
