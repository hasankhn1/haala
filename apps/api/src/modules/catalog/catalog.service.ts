import type { CategoryView, Paginated, ProductsQuery, ProductView } from '@haala/shared';
import { AppError } from '../../common/errors';
import type { Category } from '../../db/schema';
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
  name: p.name,
  slug: p.slug,
  unit: p.unit,
  description: p.description,
  imageUrl: p.imageUrl,
  categoryId: p.categoryId,
  price: Number(p.price),
  basePrice: p.basePrice,
  availableQty: Number(p.availableQty),
  inStock: Number(p.availableQty) > 0,
});

export const catalogService = {
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
    return toProductView(row);
  },
};
