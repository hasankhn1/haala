import { useMemo } from 'react';
import { useToast } from '@haala/ui';
import { ApiError } from '../api/client';
import { haptics } from '../lib/haptics';
import { useCart, useCartMutations } from './useCart';

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
     * The product with an add in flight, so a card can show a spinner on its
     * own button instead of every card reacting to any add.
     */
    busyProductId: add.isPending ? (add.variables?.variantId ?? null) : null,
    /** Add `quantity` of a **variant** to the cart (defaults to a single unit). */
    addOne: (variantId: string | null, quantity = 1) => {
      if (!storeId || !variantId) return;
      haptics.tap();
      add.mutate(
        { storeId, variantId, quantity },
        {
          // No success toast: the card flips to a stepper and the haptic already
          // fired, so a toast on every tap is three signals for one action — and
          // it covers the very control the customer is about to tap again.
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
