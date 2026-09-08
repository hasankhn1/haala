import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddCartItemInput,
  CartItemView,
  CartMergeResult,
  CartsView,
  CartView,
} from '@haala/shared';
import { useToast } from '@haala/ui';
import { cartApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { useAuth } from '../auth/AuthContext';
import { track } from '../lib/analytics';
import { useCurrentStore } from '../store/useCurrentStore';
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
const NO_BASKETS: CartsView = { baskets: [] };

/**
 * Every basket the customer holds — one per department.
 *
 * The shape changed from a single `CartView` when baskets were split by
 * department: the Cart tab's switcher needs each basket's count to draw itself,
 * and the tab-bar badge needs the total. Screens that want one basket use
 * `useBasket(department)`.
 */
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
  const data: CartsView = hydrated ? { baskets: useGuestCart.getState().asBaskets() } : NO_BASKETS;
  return {
    data,
    isLoading: !hydrated,
    isError: false as const,
    error: null,
    refetch: async () => undefined,
  } as unknown as ReturnType<typeof useQuery<CartsView>>;
}

/** An empty basket for a department nobody has added to yet. */
const emptyBasket = (departmentKey: string, storeId: string | null): CartView => ({
  id: `empty:${departmentKey}`,
  departmentKey,
  storeId,
  items: [],
  itemCount: 0,
  subtotal: 0,
});

/**
 * One department's basket.
 *
 * Always returns a basket, empty if there is nothing in it, so a screen never
 * has to branch on "no basket yet" separately from "basket with no lines".
 */
export function useBasket(department: string) {
  const cart = useCart();
  const storeId = useCurrentStore().storeId;
  const basket =
    cart.data?.baskets.find((b) => b.departmentKey === department) ??
    emptyBasket(department, storeId);
  return { ...cart, basket };
}

/**
 * Everything in every basket, for the tab-bar badge.
 *
 * The badge counts across departments deliberately: it answers "have I got
 * anything on the go", and a customer with a shirt in one basket and nothing in
 * the one they happen to be looking at should not see a zero.
 */
export function useCartCount(): number {
  const cart = useCart();
  return (cart.data?.baskets ?? []).reduce((n, b) => n + b.itemCount, 0);
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

  /**
   * A mutation answers with the one basket it changed; the cache holds them
   * all. Splice rather than replace, or editing the clothing basket would wipe
   * the grocery one from the switcher until the next refetch.
   */
  const applyBasket = (data: CartView) =>
    qc.setQueryData<CartsView>(qk.cart, (prev) => {
      const others = (prev?.baskets ?? []).filter((b) => b.departmentKey !== data.departmentKey);
      return { baskets: data.items.length > 0 ? [...others, data] : others };
    });

  const optimistic = async (mutate: (cart: CartView) => CartView, variantId: string) => {
    await qc.cancelQueries({ queryKey: qk.cart });
    const previous = qc.getQueryData<CartsView>(qk.cart);
    if (previous) {
      // Which basket holds the line is looked up, not passed in — a stepper
      // knows a variant, not a department.
      qc.setQueryData<CartsView>(qk.cart, {
        baskets: previous.baskets.map((b) =>
          b.items.some((i) => i.variantId === variantId) ? recompute(mutate(b)) : b,
        ),
      });
    }
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { previous?: CartsView }) => {
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
      return { baskets: useGuestCart.getState().asBaskets() };
    },
    onSuccess: (data) => {
      // Guest edits are local state and answer with the whole set, which
      // nothing reads; only the server's single-basket reply seeds the cache.
      if (authed) applyBasket(data as CartView);
    },
  });

  // Lines are addressed by variant: two sizes of one product are two lines.
  const update = useMutation({
    mutationFn: async (vars: { variantId: string; quantity: number }) => {
      if (authed) return cartApi.updateItem(vars.variantId, vars.quantity);
      guest.setQuantity(vars.variantId, vars.quantity);
      return { baskets: useGuestCart.getState().asBaskets() };
    },
    onMutate: (vars) =>
      authed
        ? optimistic(
              (cart) => ({
                ...cart,
                items: cart.items.map((i) =>
                  i.variantId === vars.variantId ? { ...i, quantity: vars.quantity } : i,
                ),
              }),
              vars.variantId,
            )
        : nothingToRollBack(),
    onError: rollback,
    onSuccess: (data) => {
      // Guest edits are local state and answer with the whole set, which
      // nothing reads; only the server's single-basket reply seeds the cache.
      if (authed) applyBasket(data as CartView);
    },
  });

  const remove = useMutation({
    mutationFn: async (variantId: string) => {
      if (authed) return cartApi.removeItem(variantId);
      guest.remove(variantId);
      return { baskets: useGuestCart.getState().asBaskets() };
    },
    onMutate: (variantId) =>
      authed
        ? optimistic(
              (cart) => ({
                ...cart,
                items: cart.items.filter((i) => i.variantId !== variantId),
              }),
              variantId,
            )
        : nothingToRollBack(),
    onError: rollback,
    onSuccess: (data) => {
      // Guest edits are local state and answer with the whole set, which
      // nothing reads; only the server's single-basket reply seeds the cache.
      if (authed) applyBasket(data as CartView);
    },
  });

  const clear = useMutation({
    // Empties one department's basket; the others are untouched.
    mutationFn: async (department: string) => {
      if (authed) return cartApi.clear(department);
      guest.clear();
      return { baskets: useGuestCart.getState().asBaskets() };
    },
    onSuccess: (data) => {
      // Guest edits are local state and answer with the whole set, which
      // nothing reads; only the server's single-basket reply seeds the cache.
      if (authed) applyBasket(data as CartView);
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
/**
 * Hand the device basket to the account that just signed in — **and say what
 * happened to it**.
 *
 * The reporting lives here rather than in the callers, and that is the fix for a
 * real bug rather than a tidy-up. The server goes to some trouble to distinguish
 * "merged", "this line sold out" and "you asked for six and there are two"
 * (`merge.test.ts`: *one bad line must not cost the basket... merge what can be
 * merged, and say what could not*). Checkout had careful handling for all three
 * — but `SignInFlow` merges first and clears the device basket, so by the time
 * checkout's effect ran `mergePayload()` returned `null` and it returned early.
 * The customer arrived at checkout short of items they had chosen and was told
 * nothing, in every path, because the one caller that reported was never the
 * one that merged.
 *
 * Reporting from the single place a merge can happen means it cannot go
 * unreported again, and cannot be reported twice.
 */
export function useMergeGuestCart() {
  const qc = useQueryClient();
  const toast = useToast();

  return async (): Promise<CartMergeResult | null> => {
    const payload = useGuestCart.getState().mergePayload();
    if (!payload) return null;

    const result = await cartApi.merge(payload);
    // Only cleared once the server has confirmed, so a failed merge leaves the
    // basket on the device to try again rather than dropping it.
    useGuestCart.getState().clear();
    qc.setQueryData<CartsView>(qk.cart, { baskets: result.baskets });

    // Counted across baskets: a device basket can span departments, so "how
    // many lines arrived" is the total rather than one basket's worth.
    const merged = result.baskets.reduce((n, b) => n + b.items.length, 0);

    track({
      name: 'guest_cart_merged',
      lines: merged,
      skipped: result.skipped.length,
    });

    // Most specific thing first: a customer who lost a line needs to know that
    // far more than they need a welcome.
    if (result.skipped.length > 0) {
      const n = result.skipped.length;
      toast.show(`${n} item${n === 1 ? '' : 's'} sold out and left your basket`, 'error');
    } else if (result.adjusted.length > 0) {
      toast.show('Some quantities were reduced to what is in stock', 'error');
    } else if (result.replacedOtherStore) {
      toast.show('Your basket from another store was replaced');
    } else if (merged > 0) {
      toast.show('Welcome back — your basket is here');
    }

    return result;
  };
}
