import { useMemo } from 'react';
import type { CartItemView, ProductVariantView, ProductView } from '@haala/shared';
import { useToast } from '@haala/ui';
import { ApiError } from '../api/client';
import { haptics } from '../lib/haptics';
import { useCart, useCartMutations } from './useCart';

/**
 * The display fields a guest basket needs to draw a line it holds locally.
 *
 * A signed-out basket lives on the device and has no server to ask what a
 * variant is called or costs, so the values are snapshotted at the moment of
 * adding. Display only — the price is re-read on merge and again at checkout,
 * so a stale snapshot can be briefly wrong on screen but never wrong on a bill.
 */
type LineSnapshot = Omit<CartItemView, 'lineTotal' | 'quantity'>;

/** From a catalogue card, whose price is already the current store's. */
const lineFromProduct = (p: ProductView): LineSnapshot => ({
  variantId: p.defaultVariantId as string,
  productId: p.id,
  name: p.name,
  unit: p.unit,
  imageUrl: p.imageUrl,
  unitPrice: p.price,
  basePrice: p.basePrice,
  inStock: p.inStock,
});

/** From a chosen size on the product page: its own unit, price and stock. */
const lineFromVariant = (p: ProductView, v: ProductVariantView): LineSnapshot => ({
  variantId: v.id,
  productId: p.id,
  name: p.name,
  unit: v.label,
  imageUrl: p.imageUrl,
  unitPrice: v.price,
  basePrice: v.basePrice,
  inStock: v.inStock,
});

/** Shared cart glue for product cards: quantities + add/adjust with feedback. */
export function useProductActions(storeId: string | null) {
  const toast = useToast();
  const cart = useCart();
  const { add, update } = useCartMutations();

  /**
   * Keyed by **variant**, because that is what a basket line holds — two sizes
   * of the same product are two lines with two quantities.
   */
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cart.data?.items.forEach((i) => map.set(i.variantId, i.quantity));
    return map;
  }, [cart.data]);

  return {
    cart,
    qtyByProduct,
    busy: add.isPending,
    /**
     * The **variant** with an add in flight, so a card can spin its own button
     * instead of every card reacting to any add. Named for what it holds: it
     * was `busyProductId` and kept being compared against product ids, which
     * silently meant no card ever showed a spinner.
     */
    busyVariantId: add.isPending ? (add.variables?.variantId ?? null) : null,
    /**
     * Add `quantity` of a **variant** to the basket.
     *
     * `line` is required for a signed-out customer, whose basket is local and
     * therefore has to carry its own display fields. Prefer `addProduct` or
     * `addVariant` below, which build it from data the caller already has.
     */
    addOne: (variantId: string | null, quantity = 1, line?: LineSnapshot) => {
      if (!storeId || !variantId) return;
      haptics.tap();
      add.mutate(
        { storeId, variantId, quantity, ...(line ? { line } : {}) },
        {
          // No success toast: the card flips to a stepper and the haptic already
          // fired, so a toast on every tap is three signals for one action — and
          // it covers the very control the customer is about to tap again.
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not add item', 'error'),
        },
      );
    },
    /** A catalogue card's default size. The common case. */
    addProduct: (p: ProductView, quantity = 1) => {
      if (!storeId || !p.defaultVariantId) return;
      haptics.tap();
      add.mutate(
        { storeId, variantId: p.defaultVariantId, quantity, line: lineFromProduct(p) },
        {
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not add item', 'error'),
        },
      );
    },
    /** A size chosen on the product page. */
    addVariant: (p: ProductView, v: ProductVariantView, quantity = 1) => {
      if (!storeId) return;
      haptics.tap();
      add.mutate(
        { storeId, variantId: v.id, quantity, line: lineFromVariant(p, v) },
        {
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not add item', 'error'),
        },
      );
    },
    setQty: (variantId: string, quantity: number) => {
      haptics.select();
      update.mutate(
        { variantId, quantity },
        {
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not update cart', 'error'),
        },
      );
    },
  };
}
