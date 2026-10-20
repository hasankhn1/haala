import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_RECENTS = 8;

/** Where a search ran: a department key, or `all` for the marketplace-wide one. */
export type SearchScope = string;

interface SearchState {
  /**
   * Recent terms per scope. A grocery "Eggs" replayed inside clothing search
   * only finds nothing — the same leak the department filter exists to stop.
   */
  recents: Record<SearchScope, string[]>;
  /** True once the persisted recents have been read back from storage. */
  hydrated: boolean;
  setHydrated: () => void;
  addRecent: (scope: SearchScope, term: string) => void;
  removeRecent: (scope: SearchScope, term: string) => void;
  clearRecents: (scope: SearchScope) => void;
}

/**
 * Recent searches, persisted across launches. Terms are de-duplicated
 * case-insensitively and kept most-recent-first, capped at {@link MAX_RECENTS}
 * so the list stays a shortcut rather than a history log.
 */
export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recents: {},
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      addRecent: (scope, term) =>
        set((state) => {
          const value = term.trim();
          if (value.length < 2) return state;
          const rest = (state.recents[scope] ?? []).filter(
            (r) => r.toLowerCase() !== value.toLowerCase(),
          );
          return { recents: { ...state.recents, [scope]: [value, ...rest].slice(0, MAX_RECENTS) } };
        }),
      removeRecent: (scope, term) =>
        set((state) => ({
          recents: { ...state.recents, [scope]: (state.recents[scope] ?? []).filter((r) => r !== term) },
        })),
      clearRecents: (scope) => set((state) => ({ recents: { ...state.recents, [scope]: [] } })),
    }),
    {
      name: 'haala.search',
      storage: createJSONStorage(() => AsyncStorage),
      // v0 kept one flat list, from before search was scoped. It was made from
      // the unscoped search, so that is where it goes.
      version: 1,
      migrate: (persisted, version) => {
        const s = persisted as { recents?: unknown };
        if (version === 0 && Array.isArray(s.recents)) return { recents: { all: s.recents } };
        return persisted as Pick<SearchState, 'recents'>;
      },
      // Only the terms are worth persisting; `hydrated` is per-launch state.
      partialize: (state) => ({ recents: state.recents }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
