import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddCartItemInput, CartItemView, CartMergeResult, CartView } from '@haala/shared';
import { cartApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { useAuth } from '../auth/AuthContext';
import { useGuestCart } from '../store/useGuestCart';

/**
 * The basket, wherever it happens to live.
 *
 * A signed-in customer's basket is on the server; a guest's is on the device.
 * Both are exposed through this one hook and one mutation set, returning the
 * same `CartView` either way, so **no screen knows or cares which it is
 * looking at**. That is the reason the guest basket cost almost nothing to
 * add: the cart was already entirely encapsulated here, and only this file and
 * `endpoints.ts` ever touched `cartApi`.
 */
const EMPTY: CartView = { id: 'guest', storeId: null, items: [], itemCount: 0, subtotal: 0 };

export function useCart() {
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const guestLines = useGuestCart((s) => s.lines);
  const guestStore = useGuestCart((s) => s.storeId);
  const hydrated = useGuestCart((s) => s.hydrated);

  const server = useQuery({
    queryKey: qk.cart,
    queryFn: cartApi.get,
    // Never asked for while signed out — the routes are authenticated, and a
    // guaranteed 401 on every launch is not a request worth making.
    enabled: authed,
  });

  if (authed) return server;

  // Shaped like a react-query result so callers keep using `.data`,
  // `.isLoading` and the rest without a branch of their own. `isLoading` is
  // true until AsyncStorage has been read, so a restored basket does not flash
  // as empty first.
  const data: CartView = {
    ...EMPTY,
    storeId: guestStore,
    items: guestLines,
    itemCount: guestLines.reduce((n, l) => n + l.quantity, 0),
    subtotal: guestLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  };
  return {
    data,
    isLoading: !hydrated,
    isError: false as const,
    error: null,
    refetch: async () => undefined,
  } as unknown as ReturnType<typeof useQuery<CartView>>;
}

/** Recompute cart totals after an optimistic line edit. */
const recompute = (cart: CartView): CartView => ({
  ...cart,
  itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
  subtotal: cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
});

/**
 * Cart mutations, dispatched to the server or to the device.
 *
 * The server variants return the full `CartView` and seed the cache; quantity
 * and remove are also optimistic so steppers feel instant, with rollback on
 * error. The guest variants are synchronous local state, so they are already
 * instant and need neither.
 *
 * `add` for a guest needs the line's display fields — see `useGuestCart` for
 * why a local basket snapshots them. Callers pass them via `line`.
 */
export function useCartMutations() {
  const qc = useQueryClient();
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const guest = useGuestCart();

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
  /**
   * A guest edit is synchronous local state, so there is nothing to snapshot
   * and nothing to undo. `onMutate` must still return a context object —
   * returning `undefined` is not a shape react-query accepts — so this says
   * "no previous state" explicitly rather than by omission.
   */
  const nothingToRollBack = async () => ({ previous: undefined });

  const add = useMutation({
    // `quantity` comes from the input rather than the snapshot, so there is
    // exactly one place it is stated.
    mutationFn: async (
      input: AddCartItemInput & { line?: Omit<CartItemView, 'lineTotal' | 'quantity'> },
    ) => {
      if (authed) return cartApi.addItem(input);
      if (!input.line) {
        // A programming error rather than a user-facing one: the guest basket
        // cannot render a line it knows nothing about.
        throw new Error('A guest basket needs the line’s display fields');
      }
      guest.add(input.storeId, { ...input.line, quantity: input.quantity ?? 1 });
      return useGuestCart.getState().asCartView();
    },
    onSuccess: (data) => {
      if (authed) onSuccess(data);
    },
  });

  // Lines are addressed by variant: two sizes of one product are two lines.
  const update = useMutation({
    mutationFn: async (vars: { variantId: string; quantity: number }) => {
      if (authed) return cartApi.updateItem(vars.variantId, vars.quantity);
      guest.setQuantity(vars.variantId, vars.quantity);
      return useGuestCart.getState().asCartView();
    },
    onMutate: (vars) =>
      authed
        ? optimistic((cart) => ({
            ...cart,
            items: cart.items.map((i) =>
              i.variantId === vars.variantId ? { ...i, quantity: vars.quantity } : i,
            ),
          }))
        : nothingToRollBack(),
    onError: rollback,
    onSuccess: (data) => {
      if (authed) onSuccess(data);
    },
  });

  const remove = useMutation({
    mutationFn: async (variantId: string) => {
      if (authed) return cartApi.removeItem(variantId);
      guest.remove(variantId);
      return useGuestCart.getState().asCartView();
    },
    onMutate: (variantId) =>
      authed
        ? optimistic((cart) => ({
            ...cart,
            items: cart.items.filter((i) => i.variantId !== variantId),
          }))
        : nothingToRollBack(),
    onError: rollback,
    onSuccess: (data) => {
      if (authed) onSuccess(data);
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (authed) return cartApi.clear();
      guest.clear();
      return useGuestCart.getState().asCartView();
    },
    onSuccess: (data) => {
      if (authed) onSuccess(data);
    },
  });

  return { add, update, remove, clear };
}

/**
 * Hand the device basket over after signing in.
 *
 * Called once, immediately after authentication, from wherever sign-in
 * happened. The local basket is only cleared **after** the server confirms —
 * clearing first would lose it entirely if the request failed, which is the
 * exact outcome the design says must never happen.
 *
 * Returns null when there was nothing to merge, so a caller can tell "nothing
 * to do" from "merged, here is what changed".
 */
export function useMergeGuestCart() {
  const qc = useQueryClient();

  return async (): Promise<CartMergeResult | null> => {
    const payload = useGuestCart.getState().mergePayload();
    if (!payload) return null;

    const result = await cartApi.merge(payload);
    useGuestCart.getState().clear();
    qc.setQueryData(qk.cart, result.cart);
    return result;
  };
}
