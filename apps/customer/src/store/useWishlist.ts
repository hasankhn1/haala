import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface WishlistState {
  /** Product ids the customer has saved. A Set would not survive JSON, so it
   *  is an array here and membership is checked with {@link has}. */
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

/**
 * The wishlist heart, persisted across launches.
 *
 * Frontend-only for now: apparel is browsed and saved before it is bought, so
 * the heart needs to agree between the grid and the product page and survive a
 * relaunch. A server-backed wishlist (sharing, "back in stock") is a separate
 * feature the backend owns — this store is the seam it will replace.
 */
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      has: (id) => get().ids.includes(id),
      toggle: (id) =>
        set((state) => ({
          ids: state.ids.includes(id)
            ? state.ids.filter((x) => x !== id)
            : [id, ...state.ids],
        })),
    }),
    {
      name: 'haala.wishlist',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ ids: state.ids }),
    },
  ),
);
