import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddCartItemInput, CartView } from '@haala/shared';
import { cartApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';

export function useCart() {
  return useQuery({ queryKey: qk.cart, queryFn: cartApi.get });
}

/** Recompute cart totals after an optimistic line edit. */
const recompute = (cart: CartView): CartView => ({
  ...cart,
  itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
  subtotal: cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
});

/**
 * Cart mutations. All return the full CartView, so on success we seed the
 * cache. Quantity/remove are also applied optimistically so steppers feel
 * instant, with rollback on error.
 */
export function useCartMutations() {
  const qc = useQueryClient();
  const onSuccess = (data: CartView) => qc.setQueryData(qk.cart, data);

  const optimistic = async (mutate: (cart: CartView) => CartView) => {
    await qc.cancelQueries({ queryKey: qk.cart });
    const previous = qc.getQueryData<CartView>(qk.cart);
    if (previous) qc.setQueryData(qk.cart, recompute(mutate(previous)));
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { previous?: CartView }) => {
    if (ctx?.previous) qc.setQueryData(qk.cart, ctx.previous);
  };

  const add = useMutation({ mutationFn: (input: AddCartItemInput) => cartApi.addItem(input), onSuccess });

  const update = useMutation({
    mutationFn: (vars: { productId: string; quantity: number }) =>
      cartApi.updateItem(vars.productId, vars.quantity),
    onMutate: (vars) =>
      optimistic((cart) => ({
        ...cart,
        items: cart.items.map((i) =>
          i.productId === vars.productId ? { ...i, quantity: vars.quantity } : i,
        ),
      })),
    onError: rollback,
    onSuccess,
  });

  const remove = useMutation({
    mutationFn: (productId: string) => cartApi.removeItem(productId),
    onMutate: (productId) =>
      optimistic((cart) => ({ ...cart, items: cart.items.filter((i) => i.productId !== productId) })),
    onError: rollback,
    onSuccess,
  });

  const clear = useMutation({ mutationFn: () => cartApi.clear(), onSuccess });

  return { add, update, remove, clear };
}
