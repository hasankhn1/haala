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

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cart.data?.items.forEach((i) => map.set(i.productId, i.quantity));
    return map;
  }, [cart.data]);

  return {
    cart,
    qtyByProduct,
    busy: add.isPending,
    /** Add `quantity` of a product to the cart (defaults to a single unit). */
    addOne: (productId: string, quantity = 1) => {
      if (!storeId) return;
      haptics.tap();
      add.mutate(
        { storeId, productId, quantity },
        {
          onSuccess: () => toast.show('Added to cart'),
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not add item', 'error'),
        },
      );
    },
    setQty: (productId: string, quantity: number) => {
      haptics.select();
      update.mutate(
        { productId, quantity },
        {
          onError: (e) =>
            toast.show(e instanceof ApiError ? e.message : 'Could not update cart', 'error'),
        },
      );
    },
  };
}
