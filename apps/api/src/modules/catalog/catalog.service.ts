import type {
  CategoryView,
  DepartmentView,
  HomeCategoryView,
  HomeView,
  Paginated,
  ProductsQuery,
  ProductView,
} from '@haala/shared';
import { cached, cacheKey, HOME_TTL_SECONDS } from '../../common/cache';
import { AppError } from '../../common/errors';
import type { Category } from '../../db/schema';
import { bannerService } from '../home/banner.service';
import { featuredService } from '../home/featured.service';
import { catalogRepository, type ProductWithStock } from './catalog.repository';

const toCategoryView = (c: Category): CategoryView => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  imageUrl: c.imageUrl,
  sortOrder: c.sortOrder,
});

/**
 * Exported because "buy it again" prices products through the same catalogue
 * query and must present them identically. Two mappers would drift, and the
 * one that drifted would be the one nobody was looking at.
 */
export const toProductView = (p: ProductWithStock): ProductView => ({
  id: p.id,
  brandName: p.brandName,
  brandSlug: p.brandSlug,
  departmentKey: p.departmentKey,
  name: p.name,
  slug: p.slug,
  unit: p.unit,
  description: p.description,
  imageUrl: p.imageUrl,
  categoryId: p.categoryId,
  price: Number(p.price),
  basePrice: p.basePrice,
  availableQty: Number(p.availableQty),
  defaultVariantId: p.defaultVariantId ?? null,
  inStock: Number(p.availableQty) > 0,
});

/** Chips wrap onto a second row past this, and the comp draws one row. */
const HOME_CATEGORY_LIMIT = 12;

/**
 * A hard cap on the grid, independent of how many ops features. The comp draws
 * two columns; six rows of it is already a generous home screen.
 */
const POPULAR_LIMIT = 12;

export const catalogService = {
  /**
   * The departments the marketplace home lists.
   *
   * Everything active is returned, including the empty ones — a department with
   * nothing in it still says something worth saying ("Bakery, coming soon"),
   * and hiding it would make the shop look smaller than it is rather than
   * newer. The apps decide how to render `isLive`; the server only decides
   * what is true.
   */
  async departments(): Promise<DepartmentView[]> {
    const rows = await catalogRepository.listDepartments();
    return rows.map((d) => ({
      key: d.key,
      name: d.name,
      sortOrder: d.sortOrder,
      isLive: d.hasStock,
    }));
  },
  /**
   * Everything the marketplace home draws, in one round trip.
   *
   * Four queries the app would otherwise make separately, and it made them
   * serially — departments, then categories, then products — so the screen
   * showed three separate spinners settling at three different moments.
   *
   * Keyed by store, and that is not a detail: price is a per-store override and
   * stock is per-store outright, so a shared key would let one store's shelf be
   * served to a shopper standing next to another. A shopper with no store
   * resolved yet still gets departments and banners, which is enough to render
   * the top of the screen while location settles.
   */
  async home(storeId: string | null): Promise<HomeView> {
    return cached(cacheKey('home', storeId ?? 'no-store'), HOME_TTL_SECONDS, async () => {
      const [departments, categoryRows] = await Promise.all([
        this.departments(),
        catalogRepository.listHomeCategories(),
      ]);

      // Banners for departments that no longer exist are dropped rather than
      // shown pointing nowhere — see `listForHome`. The set is built from live
      // departments only, so switching a department off also retires its promo
      // without anyone having to remember to.
      const liveKeys = new Set(departments.filter((d) => d.isLive).map((d) => d.key));

      const [banners, popularProducts] = await Promise.all([
        bannerService.listForHome(liveKeys),
        this.popularProducts(storeId, liveKeys),
      ]);

      const popularCategories: HomeCategoryView[] = categoryRows
        .filter((c) => liveKeys.has(c.departmentKey))
        .map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl, departmentKey: c.departmentKey }))
        .slice(0, HOME_CATEGORY_LIMIT);

      return { departments, banners, popularCategories, popularProducts };
    });
  },

  /**
   * The "Popular right now" grid — the products ops has chosen.
   *
   * **Exclusive**: this returns exactly what is curated, in that order, and
   * nothing else. It replaced an automatic ranking by discount depth, which was
   * honest about what it was but gave ops no say in the most valuable strip of
   * the app, and whose coverage across categories was a side effect of
   * whichever rows fell inside a 100-row scan.
   *
   * Curation is global; **availability is not**. Pricing the chosen ids against
   * this store is what filters the list: `listProductsByIds` inner-joins
   * inventory and requires an active product and an unsuspended shop, so a
   * feature that is out of stock, delisted or from a suspended brand drops out
   * here without a single extra condition. Two stores therefore show different
   * subsets of one curated list, which is correct — a shopper should not be
   * shown something the shop they are buying from cannot sell.
   *
   * Needs a store for the same reason: without one there is no price and no
   * stock, and a grid of products that cannot be added to a basket is worse
   * than no grid.
   */
  async popularProducts(storeId: string | null, liveKeys?: Set<string>): Promise<ProductView[]> {
    if (!storeId) return [];

    const curated = await featuredService.activeProductIds();
    if (curated.length === 0) return [];

    const rows = await catalogRepository.listProductsByIds(curated, storeId);

    // `listProductsByIds` does not preserve the order of the ids it was given,
    // and that order *is* the feature here — it is what an editor arranged.
    const rank = new Map(curated.map((id, i) => [id, i]));

    return rows
      .filter((p) => (liveKeys ? liveKeys.has(p.departmentKey) : true))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      .slice(0, POPULAR_LIMIT)
      .map(toProductView);
  },

  async listCategories(department?: string): Promise<CategoryView[]> {
    const rows = await catalogRepository.listCategories(department);
    return rows.map(toCategoryView);
  },

  async listProducts(query: ProductsQuery): Promise<Paginated<ProductView>> {
    const { items, total } = await catalogRepository.listProducts(query);
    return {
      items: items.map(toProductView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  },

  async getProduct(productId: string, storeId: string): Promise<ProductView> {
    const row = await catalogRepository.findProductForStore(productId, storeId);
    if (!row) throw AppError.notFound('Product not found');

    // Sizes come with the detail response and nowhere else — this is the only
    // screen that offers a choice between them.
    const variants = await catalogRepository.variantsForProduct(productId, storeId);
    return {
      ...toProductView(row),
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        unit: v.unit,
        basePrice: v.basePrice,
        price: Number(v.price),
        availableQty: Number(v.availableQty),
        inStock: Number(v.availableQty) > 0,
      })),
    };
  },
};
