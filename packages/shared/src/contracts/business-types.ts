import { z } from 'zod';
import type { AttributeField } from '../business-types';

/**
 * Business types as the API exposes them.
 *
 * A type's *fields* are not editable over HTTP — they live in
 * `businessTypeSpecs` and are validated with zod, so they arrive here read-only
 * as part of the view. What the super admin controls at runtime is which types
 * exist, what they're called, their order, and whether they're offered at all.
 */

export const createBusinessTypeSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'Use lower-case letters, numbers and underscores'),
    name: z.string().trim().min(2).max(80),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .strict();
export type CreateBusinessTypeInput = z.infer<typeof createBusinessTypeSchema>;

export const updateBusinessTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateBusinessTypeInput = z.infer<typeof updateBusinessTypeSchema>;

export interface BusinessTypeView {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** How many brands would be affected by disabling it. */
  brandCount: number;
  /**
   * False when the row has no matching entry in `businessTypeSpecs` — a type
   * that was added to the database but whose registry entry has not shipped.
   * Brands on it cannot save product attributes, so the dashboard flags it
   * rather than letting someone assign a brand to a dead type.
   */
  hasSpec: boolean;
  /** Read-only, from the registry. Empty when `hasSpec` is false. */
  fields: AttributeField[];
  variantNoun: string | null;
}
