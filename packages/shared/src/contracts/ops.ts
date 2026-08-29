import { z } from 'zod';

/**
 * Ops/dashboard contracts. These are the write surfaces an operator needs that
 * no customer or rider ever touches — pricing, stock and catalogue state.
 *
 * Money stays in **integer paisa** here as everywhere else; the dashboard
 * converts at the input edge so an operator can type rupees.
 */

export const updateProductSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    unit: z.string().min(1).max(40).optional(),
    /** Base price in paisa. Store overrides live on inventory. */
    basePrice: z.number().int().min(0).optional(),
    imageUrl: z.string().url().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const updateInventorySchema = z
  .object({
    quantityAvailable: z.number().int().min(0).optional(),
    /** Suspend or resume the line without touching its stock figure. */
    isAvailable: z.boolean().optional(),
    /** Store-specific price in paisa; `null` clears the override. */
    price: z.number().int().min(0).nullable().optional(),
  })
  .strict();
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;

/** One product with its stock/pricing at a single store. */
export interface OpsCatalogRow {
  productId: string;
  name: string;
  slug: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  isActive: boolean;
  /** Catalogue-wide price, paisa. */
  basePrice: number;
  /** Store override, paisa, or null when the base price applies. */
  storePrice: number | null;
  /** What a customer at this store actually pays. */
  effectivePrice: number;
  quantityAvailable: number;
  quantityReserved: number;
  /** Units that can still be sold right now. */
  /** False when ops has suspended the line; stock figure is preserved. */
  isAvailable: boolean;
  availableToSell: number;
}

/**
 * Store create/update. `code` is the stable human key used by the seed and by
 * ops when talking about a site, so it's required on create and immutable
 * after — renaming a store is fine, re-keying it silently is not.
 */
export const createStoreSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, numbers and dashes (e.g. LHR-DHA5)'),
  addressLine: z.string().min(3).max(200),
  area: z.string().min(2).max(120),
  city: z.string().min(2).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** How far this store will deliver, in metres. */
  deliveryRadiusMeters: z.number().int().min(500).max(50_000).default(5000),
  isActive: z.boolean().default(true),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = createStoreSchema.omit({ code: true }).partial().strict();
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export interface OpsStoreView {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  deliveryRadiusMeters: number;
  isActive: boolean;
}
