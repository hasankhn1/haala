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
import { catalogRepository, type ProductWithStock } from './catalog.repository';

const toCategoryView = (c: Category): CategoryView => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  imageUrl: c.imageUrl,
  sortOrder: c.sortOrder,
});

const toProductView = (p: ProductWithStock): ProductView => ({
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

/** The comp's grid is two columns; six rows of it is a generous home screen. */
const POPULAR_LIMIT = 12;

/** How wide a slice of the catalogue the ranking above sorts over. */
const POPULAR_SCAN_SIZE = 100;

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
        .map((c) => ({ id: c.id, name: c.name, departmentKey: c.departmentKey }))
        .slice(0, HOME_CATEGORY_LIMIT);

      return { departments, banners, popularCategories, popularProducts };
    });
  },

  /**
   * The "Popular right now" grid.
   *
   * **It is not popularity.** Nothing here records views or sales yet, so
   * ranking by them would be a lie dressed as data. What it actually ranks is
   * *discount depth* — the store markdown a shopper can see for themselves on
   * the card — and among equally-priced items it keeps the catalogue's own
   * order. That is a defensible thing to put under that heading, and when order
   * history is worth mining this function is the only place that changes.
   *
   * Needs a store: without one there is no price and no stock, and a grid of
   * products that cannot be added to a basket is worse than no grid.
   */
  async popularProducts(storeId: string | null, liveKeys?: Set<string>): Promise<ProductView[]> {
    if (!storeId) return [];

    const { items } = await catalogRepository.listProducts({
      storeId,
      page: 1,
      // Ranking happens here rather than in SQL, so the page has to be wide
      // enough to rank over. Bounded well under the catalogue size on purpose:
      // this is a home screen, not a report.
      pageSize: POPULAR_SCAN_SIZE,
    });

    const discount = (p: ProductWithStock) =>
      p.basePrice > 0 ? (p.basePrice - Number(p.price)) / p.basePrice : 0;

    return items
      .filter((p) => Number(p.availableQty) > 0)
      .sort((a, b) => discount(b) - discount(a))
      .slice(0, POPULAR_LIMIT)
      .map(toProductView);
  },

  async listCategories(): Promise<CategoryView[]> {
    const rows = await catalogRepository.listCategories();
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
