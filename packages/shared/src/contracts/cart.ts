import { z } from 'zod';

export const addCartItemSchema = z.object({
  storeId: z.string().uuid(),
  /** The size being bought — stock and price are per variant, not per product. */
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  // 0 removes the item.
  quantity: z.number().int().min(0).max(99),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export interface CartItemView {
  /** The variant is what the line holds and what quantity edits address. */
  variantId: string;
  /** Kept so a line can still link back to its product page. */
  productId: string;
  name: string;
  /** The variant's label, e.g. "500 g". */
  unit: string;
  imageUrl: string | null;
  unitPrice: number; // paisa — what the customer pays
  basePrice: number; // paisa — catalogue price before overrides/promotions
  quantity: number;
  lineTotal: number; // paisa
  inStock: boolean;
}

export interface CartView {
  id: string;
  storeId: string | null;
  items: CartItemView[];
  itemCount: number;
  subtotal: number; // paisa
}
