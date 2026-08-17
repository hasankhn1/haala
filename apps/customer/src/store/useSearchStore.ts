import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_RECENTS = 8;

interface SearchState {
  recents: string[];
  /** True once the persisted recents have been read back from storage. */
  hydrated: boolean;
  setHydrated: () => void;
  addRecent: (term: string) => void;
  removeRecent: (term: string) => void;
  clearRecents: () => void;
}

/**
 * Recent searches, persisted across launches. Terms are de-duplicated
 * case-insensitively and kept most-recent-first, capped at {@link MAX_RECENTS}
 * so the list stays a shortcut rather than a history log.
 */
export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recents: [],
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      addRecent: (term) =>
        set((state) => {
          const value = term.trim();
          if (value.length < 2) return state;
          const rest = state.recents.filter((r) => r.toLowerCase() !== value.toLowerCase());
          return { recents: [value, ...rest].slice(0, MAX_RECENTS) };
        }),
      removeRecent: (term) =>
        set((state) => ({ recents: state.recents.filter((r) => r !== term) })),
      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'haala.search',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the terms are worth persisting; `hydrated` is per-launch state.
      partialize: (state) => ({ recents: state.recents }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
