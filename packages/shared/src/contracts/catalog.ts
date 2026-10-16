import { z } from 'zod';

export const productsQuerySchema = z.object({
  storeId: z.string().uuid(),
  /**
   * Restrict to one department, by business-type key ("grocery", "clothing").
   *
   * A department screen is a shop, not a filtered view of everything — opening
   * Clothing and finding cooking oil in it is the whole problem this solves.
   * Optional because search and the "all products" listing are deliberately
   * cross-department.
   */
  department: z.string().min(1).max(40).optional(),
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
  /** The brand's struck-through "was" price for this size, paisa, if any. */
  compareAtPrice: number | null;
  availableQty: number;
  inStock: boolean;
  /**
   * The axes this variant sits on, e.g. `{"size":"M","color":"Rose"}`. Empty
   * on a grocery pack size. The clothing PDP builds its size row and colour row
   * from these rather than splitting `label`.
   */
  options?: Record<string, string>;
}

export interface ProductView {
  /**
   * Who is selling it. Additive, and the apps may ignore it — but with more
   * than one shop on the platform a customer needs to be told whose cake this
   * is, so the data is here ready for the screen that shows it.
   */
  brandName: string;
  brandSlug: string;
  /**
   * Which department the product trades in, from its brand’s business type.
   *
   * The marketplace home needs it for two things the comp specifies per
   * department rather than per product: the small label above the name, and
   * the card’s image height — 150px for grocery, 180px elsewhere, because a
   * garment photographed on a person needs vertical room a tin of beans does
   * not.
   */
  departmentKey: string;
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
   * That variant's axes, e.g. `{"size":"S","color":"Red"}` — so a line added
   * straight from a card can say which size and colour it is, before the
   * server's basket answers. Empty for grocery pack sizes.
   */
  defaultVariantOptions: Record<string, string>;
  /**
   * Every sellable size, cheapest-first. Present on the **detail** response
   * only — the listing resolves each product's default variant instead, since
   * loading every size would multiply each row by its variant count.
   */
  variants?: ProductVariantView[];
  /** Every photo, hero first. Detail response only, like `variants`. */
  images?: string[];
  /**
   * The brand-entered specs, shaped by the department's `businessTypeSpecs`
   * schema — clothing's `pieces` and `fabric` become chips under the title.
   * Detail response only.
   */
  attributes?: Record<string, unknown>;
}

/**
 * A department on the marketplace home — one business type, as a shopper sees
 * it.
 *
 * Data only. The colour, the examples line, the CTA and the flag live in
 * `departmentTints` (`@haala/design-tokens`) and `departmentCopy`
 * (`business-types.ts`), keyed by `key`. Presentation does not belong in a
 * response, and keeping it out is what lets the same endpoint serve a
 * department the apps have not been taught to style yet.
 */
export interface DepartmentView {
  key: string;
  name: string;
  sortOrder: number;
  /**
   * Whether there is anything to buy in it right now — a sellable brand with an
   * active, stocked product. Drives "coming soon" without anybody having to
   * remember to flip a flag when the first product lands.
   */
  isLive: boolean;
}
