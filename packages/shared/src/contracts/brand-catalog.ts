import { z } from 'zod';

/**
 * A brand's own catalogue — the surface a vendor uses on their dashboard.
 *
 * `brandId` appears nowhere in any of these schemas, and that is the point.
 * The tenant comes from the verified access token via `brandScope`; a body
 * field would be another place to get authorization wrong. All of them are
 * `.strict()`, so an attempt to smuggle one in is a 422 rather than a silently
 * ignored field.
 *
 * Money is integer paisa, as everywhere. The dashboard converts at the input
 * edge so a vendor types rupees.
 */

const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and hyphens');

const price = z.number().int().min(0).max(100_000_000);

// ── Categories ──────────────────────────────────────────────────────────────

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: slug.optional(),
    imageUrl: z.string().url().max(600).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.omit({ slug: true }).partial().strict();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Whole-list reorder, so dragging one row doesn't fire N requests. */
export const reorderCategoriesSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict();
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

// ── Products ────────────────────────────────────────────────────────────────

/**
 * Business-type-specific fields. Left as an open record here and validated
 * against the owning brand's `businessTypeSpecs` entry in the service, because
 * which keys are legal depends on the brand — something a static schema in a
 * shared package cannot know.
 */
const attributes = z.record(z.unknown());

export const createProductSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    slug: slug.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    imageUrl: z.string().url().max(600).nullable().optional(),
    unit: z.string().trim().min(1).max(40),
    /** What the customer pays, in paisa. */
    basePrice: price,
    /** The struck-through "was" price. Must exceed `basePrice` to mean anything. */
    compareAtPrice: price.nullable().optional(),
    sku: z.string().trim().max(60).nullable().optional(),
    attributes: attributes.optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.omit({ slug: true }).partial().strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ── Variants ────────────────────────────────────────────────────────────────

export const createVariantSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    unit: z.string().trim().min(1).max(40),
    basePrice: price,
    /** The axes this variant sits on, e.g. `{"size":"M","color":"Red"}`. */
    options: z.record(z.string().trim().max(60)).optional(),
    sku: z.string().trim().max(60).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema.partial().strict();
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export interface BrandCategoryView {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface BrandVariantView {
  id: string;
  label: string;
  unit: string;
  basePrice: number;
  options: Record<string, string>;
  sku: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface BrandProductView {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  unit: string;
  basePrice: number;
  compareAtPrice: number | null;
  sku: string | null;
  attributes: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  variants: BrandVariantView[];
  /**
   * Stock across every Haala store. Read-only here: the brand does not hold
   * its own inventory, so this is what the warehouse has counted, not
   * something the vendor can set.
   */
  stockOnHand: number;
}

/** The brand's own record, as it sees itself. */
export interface BrandProfileView {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  businessType: { key: string; name: string };
}

/** What a brand may change about itself — not its name, type or status. */
export const updateBrandProfileSchema = z
  .object({
    description: z.string().trim().max(600).nullable().optional(),
    logoUrl: z.string().url().max(600).nullable().optional(),
    coverUrl: z.string().url().max(600).nullable().optional(),
    contactPhone: z.string().trim().max(24).nullable().optional(),
    contactEmail: z.string().email().max(160).nullable().optional(),
  })
  .strict();
export type UpdateBrandProfileInput = z.infer<typeof updateBrandProfileSchema>;
