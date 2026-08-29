import { create } from 'zustand';

interface CheckoutDraft {
  /** "Any special requests?" — captured on the basket, sent from checkout. */
  notes: string;
  setNotes: (value: string) => void;
  reset: () => void;
}

/**
 * The in-progress order, shared between the basket and checkout.
 *
 * The comps split these into two screens, so the note is written on one and
 * submitted from the other. This is deliberately **not** persisted: a draft
 * that survived a relaunch would quietly attach yesterday's "no plastic bags"
 * to an unrelated order. It is cleared once an order is placed.
 */
export const useCheckoutDraft = create<CheckoutDraft>((set) => ({
  notes: '',
  setNotes: (notes) => set({ notes }),
  reset: () => set({ notes: '' }),
}));
