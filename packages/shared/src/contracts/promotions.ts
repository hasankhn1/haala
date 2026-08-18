import { z } from 'zod';
import { PromotionType } from '../enums';

/**
 * Promo codes are case-insensitive for the customer and stored uppercase.
 * Normalising here means the API, the app and the dashboard cannot disagree
 * about whether "haala100" and "HAALA100" are the same code.
 */
export const promoCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Promo codes use letters, numbers, - and _ only')
  .transform((c) => c.toUpperCase());

export const validatePromoSchema = z.object({ code: promoCodeSchema });
export type ValidatePromoInput = z.infer<typeof validatePromoSchema>;

export const createPromotionSchema = z
  .object({
    code: promoCodeSchema,
    type: z.enum([PromotionType.Percentage, PromotionType.FixedAmount, PromotionType.FreeDelivery]),
    /** Percent (1–100) for `percentage`; paisa for `fixed_amount`; ignored for `free_delivery`. */
    value: z.number().int().min(0).default(0),
    minOrderTotal: z.number().int().min(0).nullish(),
    maxDiscount: z.number().int().min(0).nullish(),
    usageLimit: z.number().int().min(1).nullish(),
    perUserLimit: z.number().int().min(1).nullish(),
    startsAt: z.string().datetime().nullish(),
    endsAt: z.string().datetime().nullish(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((p) => p.type !== PromotionType.Percentage || (p.value >= 1 && p.value <= 100), {
    message: 'A percentage promotion needs a value between 1 and 100',
    path: ['value'],
  })
  .refine((p) => p.type !== PromotionType.FixedAmount || p.value >= 1, {
    message: 'A fixed-amount promotion needs a value in paisa',
    path: ['value'],
  })
  .refine((p) => !p.startsAt || !p.endsAt || new Date(p.startsAt) < new Date(p.endsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z
  .object({
    isActive: z.boolean().optional(),
    usageLimit: z.number().int().min(1).nullish(),
    perUserLimit: z.number().int().min(1).nullish(),
    minOrderTotal: z.number().int().min(0).nullish(),
    maxDiscount: z.number().int().min(0).nullish(),
    endsAt: z.string().datetime().nullish(),
  })
  .strict();
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

/**
 * The result of pricing a promo against a cart. `discount` and `deliveryFee`
 * are both paisa and are the *final* values to display — a `free_delivery`
 * promo lands as `deliveryFee: 0`, not as a discount equal to the fee, so the
 * receipt reads the way a customer expects.
 */
export interface PromoQuoteView {
  code: string;
  type: PromotionType;
  discount: number;
  deliveryFee: number;
  /** Human-readable summary, e.g. "Free delivery applied". */
  message: string;
}

/** Public shape of a promotion. Admin-facing; customers only see quotes. */
export interface PromotionView {
  id: string;
  code: string;
  type: PromotionType;
  value: number;
  minOrderTotal: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
}
