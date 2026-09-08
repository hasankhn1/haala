import { z } from 'zod';

/**
 * The marketplace home: what the apps read, and what ops can change.
 *
 * `DepartmentView` lives in `catalog.ts` beside the rest of browsing; this file
 * is the editorial half — the banners, and the one payload the home screen
 * fetches.
 */

/** A promotional card on the home screen. */
export interface BannerView {
  id: string;
  /** Business-type key it promotes, or null for the whole marketplace. */
  departmentKey: string | null;
  title: string;
  badge: string | null;
  /** Resolved to a URL by the API; null when no artwork has been uploaded. */
  imageUrl: string | null;
  /** Where tapping it goes. A department key today. */
  linkTo: string | null;
  sortOrder: number;
}

/** The same banner as ops sees it, including the off ones and the raw key. */
export interface AdminBannerView extends BannerView {
  imageKey: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Everything the home screen needs, in one response.
 *
 * One request rather than four because this is the most-hit screen in the app
 * and it is cached as a unit — four endpoints would mean four cache keys that
 * can disagree with each other, and a home screen assembled from two different
 * moments in time.
 */
export interface HomeView {
  departments: import('./catalog').DepartmentView[];
  banners: BannerView[];
  popularCategories: HomeCategoryView[];
  /** Discounted first, then newest. Never claims to be measured popularity. */
  popularProducts: import('./catalog').ProductView[];
}

/** A category chip on the home screen, tagged with the department it sits in. */
export interface HomeCategoryView {
  id: string;
  name: string;
  /** Business-type key of the brand that owns it, for the chip's tint. */
  departmentKey: string;
}

// ── Ops ──────────────────────────────────────────────────────────────────────

const title = z.string().trim().min(1).max(60);
const badge = z.string().trim().max(30).nullable().optional();
/**
 * A key, not a URL. The client uploads to R2 and sends back what it was given,
 * and the API decides what URL that becomes — so moving bucket or CDN later
 * changes one function rather than every stored row.
 */
const imageKey = z.string().trim().max(300).nullable().optional();
const departmentKey = z.string().trim().max(40).nullable().optional();
const linkTo = z.string().trim().max(200).nullable().optional();

export const createBannerSchema = z
  .object({
    title,
    departmentKey,
    badge,
    imageKey,
    linkTo,
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .strict();
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

/** Every field optional, so a reorder or an on/off is not a whole-object PUT. */
export const updateBannerSchema = createBannerSchema.partial().strict();
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
