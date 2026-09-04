import { z } from 'zod';

export const addCartItemSchema = z.object({
  storeId: z.string().uuid(),
  /** The size being bought — stock and price are per variant, not per product. */
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/**
 * Hand a device-held basket to the account that just signed in.
 *
 * Only variant ids and quantities travel. The client's idea of the price is
 * display state and is never sent — the server re-reads it, so a stale snapshot
 * on a phone cannot become a stale charge.
 */
export const mergeCartSchema = z
  .object({
    storeId: z.string().uuid(),
    items: z
      .array(
        z.object({
          variantId: z.string().uuid(),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(60),
  })
  .strict();
export type MergeCartInput = z.infer<typeof mergeCartSchema>;

/**
 * The outcome of a merge, in full.
 *
 * A guest may have added something that has since sold out or whose shop was
 * suspended. Failing the whole merge over one line would lose the rest of their
 * basket, and silently dropping it would be worse — so what happened is
 * reported and the client can say so.
 */
export interface CartMergeResult {
  cart: CartView;
  /** Could not be added at all. */
  skipped: { variantId: string; reason: string }[];
  /** Added, but fewer than asked for, because that is what is in stock. */
  adjusted: { variantId: string; requested: number; added: number }[];
  /**
   * True when the account already held a basket from a *different* store and it
   * was replaced. An order cannot span two stores, and the basket the customer
   * was just looking at is the one they meant.
   */
  replacedOtherStore: boolean;
}

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
