import { asc, eq } from 'drizzle-orm';
import type {
  AdminBannerView,
  BannerView,
  CreateBannerInput,
  UpdateBannerInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import { type HomeBanner, homeBanners } from '../../db/schema';
import { publicUrlFor } from '../uploads/upload.service';

/**
 * The home screen's promotional cards.
 *
 * Two views of the same row on purpose. Shoppers get `BannerView` — active
 * ones, in order, with the image already resolved to a URL. Ops gets
 * `AdminBannerView`, which additionally carries the off ones, the raw object
 * key and the timestamps, because those are the things you need to *manage* a
 * banner and none of them are things a shopper should receive.
 */
const toView = (b: HomeBanner): BannerView => ({
  id: b.id,
  departmentKey: b.departmentKey,
  title: b.title,
  badge: b.badge,
  // Stored as an R2 key and resolved here, so moving bucket or CDN is one
  // function rather than a data migration.
  imageUrl: b.imageKey ? publicUrlFor(b.imageKey) : null,
  linkTo: b.linkTo,
  sortOrder: b.sortOrder,
});

const toAdminView = (b: HomeBanner): AdminBannerView => ({
  ...toView(b),
  imageKey: b.imageKey,
  isActive: b.isActive,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});

export const bannerService = {
  /**
   * What the home screen shows.
   *
   * `departmentKeys` is the set of departments that actually exist right now. A
   * banner pointing at one that has been disabled or removed is skipped rather
   * than shown — it would otherwise be a card that opens onto nothing, and a
   * dead promo is worse than one fewer promo. Marketplace-wide banners
   * (`departmentKey === null`) are always kept.
   */
  async listForHome(departmentKeys: Set<string>): Promise<BannerView[]> {
    const rows = await db
      .select()
      .from(homeBanners)
      .where(eq(homeBanners.isActive, true))
      .orderBy(asc(homeBanners.sortOrder), asc(homeBanners.createdAt));

    return rows
      .filter((b) => b.departmentKey === null || departmentKeys.has(b.departmentKey))
      .map(toView);
  },

  /** Everything, including the switched-off ones. Ops only. */
  async list(): Promise<AdminBannerView[]> {
    const rows = await db
      .select()
      .from(homeBanners)
      .orderBy(asc(homeBanners.sortOrder), asc(homeBanners.createdAt));
    return rows.map(toAdminView);
  },

  async create(input: CreateBannerInput): Promise<AdminBannerView> {
    const [row] = await db
      .insert(homeBanners)
      .values({
        title: input.title,
        departmentKey: input.departmentKey ?? null,
        badge: input.badge ?? null,
        imageKey: input.imageKey ?? null,
        linkTo: input.linkTo ?? null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      })
      .returning();
    if (!row) throw AppError.internal('Could not create the banner');
    return toAdminView(row);
  },

  async update(id: string, input: UpdateBannerInput): Promise<AdminBannerView> {
    /*
     * Only the keys actually sent are written. `updateBannerSchema` is a
     * `.partial()`, so an absent field means "leave it" while an explicit
     * `null` means "clear it" — spreading the whole input would turn every
     * absent field into a null and wipe the rest of the banner on a reorder.
     */
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.departmentKey !== undefined) patch.departmentKey = input.departmentKey;
    if (input.badge !== undefined) patch.badge = input.badge;
    if (input.imageKey !== undefined) patch.imageKey = input.imageKey;
    if (input.linkTo !== undefined) patch.linkTo = input.linkTo;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    const [row] = await db
      .update(homeBanners)
      .set(patch)
      .where(eq(homeBanners.id, id))
      .returning();
    if (!row) throw AppError.notFound('Banner not found');
    return toAdminView(row);
  },

  async remove(id: string): Promise<void> {
    const [row] = await db.delete(homeBanners).where(eq(homeBanners.id, id)).returning();
    if (!row) throw AppError.notFound('Banner not found');
  },
};
