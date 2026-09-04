import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItemView, CartView } from '@haala/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * A basket that belongs to the device, for someone who has not signed in.
 *
 * The design's first rule is that guests fill a basket with nothing asked of
 * them, and the server cart cannot do that — `carts.userId` is unique and every
 * `/cart` route requires a token. So this holds the lines locally until there
 * is an account to merge them into.
 *
 * **Lines carry their own display fields.** A local basket that stored only
 * variant ids would need a network round trip, a resolved store and a working
 * connection just to draw itself, and would render as empty rows on a bad
 * signal. Name, price and image are snapshotted when the line is added.
 *
 * The snapshot is display-only. Price is re-read from the server at merge and
 * again at checkout, so a stale figure here can never become a stale charge —
 * it can only be briefly wrong on screen, which is the right way round.
 */
const MAX_LINES = 60;

interface GuestCartState {
  lines: CartItemView[];
  /**
   * The store the basket was filled from. Mixing two stores in one basket is
   * not a thing the order pipeline can express, so switching store clears it.
   */
  storeId: string | null;
  /** True once AsyncStorage has been read, so the UI can wait rather than flash empty. */
  hydrated: boolean;
  setHydrated: () => void;

  add: (storeId: string, line: Omit<CartItemView, 'lineTotal'>) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** The lines in the shape `POST /cart/merge` accepts. */
  mergePayload: () => { storeId: string; items: { variantId: string; quantity: number }[] } | null;
  /** A `CartView`, so callers cannot tell a guest basket from a real one. */
  asCartView: () => CartView;
}

const withTotal = (line: Omit<CartItemView, 'lineTotal'>): CartItemView => ({
  ...line,
  lineTotal: line.unitPrice * line.quantity,
});

export const useGuestCart = create<GuestCartState>()(
  persist(
    (set, get) => ({
      lines: [],
      storeId: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      add: (storeId, line) =>
        set((state) => {
          // A basket from another store cannot be combined with this one.
          const lines = state.storeId && state.storeId !== storeId ? [] : state.lines;
          const existing = lines.find((l) => l.variantId === line.variantId);

          if (existing) {
            return {
              storeId,
              lines: lines.map((l) =>
                l.variantId === line.variantId
                  ? withTotal({ ...l, quantity: l.quantity + line.quantity })
                  : l,
              ),
            };
          }
          if (lines.length >= MAX_LINES) return { storeId, lines };
          return { storeId, lines: [...lines, withTotal(line)] };
        }),

      setQuantity: (variantId, quantity) =>
        set((state) => ({
          // Zero removes, matching the server's `updateCartItem` contract, so
          // the stepper behaves identically signed in or not.
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.variantId !== variantId)
              : state.lines.map((l) =>
                  l.variantId === variantId ? withTotal({ ...l, quantity }) : l,
                ),
        })),

      remove: (variantId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),

      clear: () => set({ lines: [], storeId: null }),

      mergePayload: () => {
        const { lines, storeId } = get();
        if (!storeId || lines.length === 0) return null;
        return {
          storeId,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        };
      },

      asCartView: () => {
        const { lines, storeId } = get();
        return {
          // A sentinel rather than a uuid: nothing may treat this as a server
          // cart id, and a recognisable value makes that obvious in a log.
          id: 'guest',
          storeId,
          items: lines,
          itemCount: lines.reduce((n, l) => n + l.quantity, 0),
          subtotal: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
        };
      },
    }),
    {
      name: 'haala.guestCart',
      storage: createJSONStorage(() => AsyncStorage),
      // `hydrated` is per-launch; the basket is what survives.
      partialize: (state) => ({ lines: state.lines, storeId: state.storeId }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
