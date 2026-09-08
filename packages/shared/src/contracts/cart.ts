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
  /**
   * Every basket afterwards, not one.
   *
   * A device-held basket can hold several departments, so a merge fans out
   * across baskets — returning only the last one touched would leave the app
   * showing a switcher missing the tabs it just created.
   */
  baskets: CartView[];
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
  /**
   * Which basket the line belongs in.
   *
   * On the server this is a property of the basket, not the line — but a guest
   * basket is a flat list on a device with no baskets to belong to, so the line
   * has to carry it for the device to group them the same way.
   */
  departmentKey: string;
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
  /**
   * Which department's basket this is. A customer buying rice and a shirt holds
   * two, and they check out separately — an order is picked and dispatched from
   * one shop, so a single order spanning a dark store and a boutique is not a
   * thing that exists.
   */
  departmentKey: string;
  storeId: string | null;
  items: CartItemView[];
  itemCount: number;
  subtotal: number; // paisa
  /**
   * True only on the response that emptied it. A basket untouched for
   * `CART_TTL_DAYS` is cleared on the next read, and the app gets one chance to
   * say so — restoring an eight-day-old basket at checkout, priced and stocked
   * as it was, is a worse surprise than an empty one.
   */
  expired?: boolean;
}

/**
 * Every basket a customer holds.
 *
 * One response rather than one request per department: the Cart tab's switcher
 * needs each basket's count to draw itself, and fetching them separately would
 * let the tabs disagree with the basket under them.
 */
export interface CartsView {
  baskets: CartView[];
}

/**
 * How long a basket survives without being touched.
 *
 * Shared because the app says it out loud ("baskets are kept for 7 days"), and
 * a number quoted in copy that disagrees with the one enforced by the server is
 * how you get a support ticket.
 */
export const CART_TTL_DAYS = 7;
