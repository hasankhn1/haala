import { z } from 'zod';

export const addCartItemSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  // 0 removes the item.
  quantity: z.number().int().min(0).max(99),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export interface CartItemView {
  productId: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  unitPrice: number; // paisa
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
