import { z } from 'zod';

export const productsQuerySchema = z.object({
  storeId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface ProductVariantView {
  id: string;
  /** e.g. "500 g" — the "Pick a size" label. */
  label: string;
  unit: string;
  /** Catalogue price in paisa, before any store override. */
  basePrice: number;
  /** What this size costs at the current store, in paisa. */
  price: number;
  availableQty: number;
  inStock: boolean;
}

export interface ProductView {
  /**
   * Who is selling it. Additive, and the apps may ignore it — but with more
   * than one shop on the platform a customer needs to be told whose cake this
   * is, so the data is here ready for the screen that shows it.
   */
  brandName: string;
  brandSlug: string;
  id: string;
  name: string;
  slug: string;
  unit: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string;
  /** Effective price for the queried store, paisa (store override ?? base). */
  price: number;
  basePrice: number;
  inStock: boolean;
  availableQty: number;
  /**
   * The variant a product card adds to the basket — the default size whose
   * price and stock this row already reports. A card cannot add a *product*:
   * stock hangs off the variant.
   */
  defaultVariantId: string | null;
  /**
   * Every sellable size, cheapest-first. Present on the **detail** response
   * only — the listing resolves each product's default variant instead, since
   * loading every size would multiply each row by its variant count.
   */
  variants?: ProductVariantView[];
}
