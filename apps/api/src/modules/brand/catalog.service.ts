import {
  type BrandCategoryView,
  type BrandProductView,
  type BrandProfileView,
  type BrandVariantView,
  type CreateCategoryInput,
  type CreateProductInput,
  type CreateVariantInput,
  type UpdateBrandProfileInput,
  type UpdateCategoryInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  parseAttributes,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import type { Category, Product, ProductVariant } from '../../db/schema';
import { slugify } from '../brands/brand.service';
import { brandCatalogRepository as repo } from './catalog.repository';

/**
 * A brand's catalogue.
 *
 * Two rules run through everything here.
 *
 * **Missing and forbidden are the same answer.** Anything belonging to another
 * brand raises 404, never 403, because a 403 confirms the row exists — that is
 * a disclosure in itself, and it is enough to enumerate a competitor's
 * catalogue by id.
 *
 * **Ownership is proved, not assumed.** A product's category is re-fetched
 * under the same brand before it is assigned, so a valid-looking `categoryId`
 * from another tenant cannot file a product into their listing.
 */

const toCategoryView = (r: { category: Category; productCount: number }): BrandCategoryView => ({
  id: r.category.id,
  name: r.category.name,
  slug: r.category.slug,
  imageUrl: r.category.imageUrl,
  sortOrder: r.category.sortOrder,
  isActive: r.category.isActive,
  productCount: r.productCount,
});

const toVariantView = (v: ProductVariant): BrandVariantView => ({
  id: v.id,
  label: v.label,
  unit: v.unit,
  basePrice: v.basePrice,
  options: v.options,
  sku: v.sku,
  sortOrder: v.sortOrder,
  isActive: v.isActive,
});

const toProductView = (
  r: { product: Product; categoryName: string; stockOnHand: number },
  variants: ProductVariant[],
): BrandProductView => ({
  id: r.product.id,
  categoryId: r.product.categoryId,
  categoryName: r.categoryName,
  name: r.product.name,
  slug: r.product.slug,
  description: r.product.description,
  imageUrl: r.product.imageUrl,
  unit: r.product.unit,
  basePrice: r.product.basePrice,
  compareAtPrice: r.product.compareAtPrice,
  sku: r.product.sku,
  attributes: r.product.attributes,
  sortOrder: r.product.sortOrder,
  isActive: r.product.isActive,
  variants: variants.map(toVariantView),
  stockOnHand: r.stockOnHand,
});

/** A slug free within this brand. Collisions across brands are fine and expected. */
async function freeSlug(
  brandId: string,
  base: string,
  taken: (brandId: string, slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';
  if (!(await taken(brandId, root))) return root;
  for (let n = 2; n <= 100; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await taken(brandId, candidate))) return candidate;
  }
  throw AppError.conflict(`Could not derive a free slug from "${base}"`);
}

/** Validate `attributes` against whatever the owning brand's type declares. */
async function checkAttributes(
  brandId: string,
  value: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (value === undefined) return undefined;
  const key = await repo.businessTypeKey(brandId);
  if (!key) throw AppError.notFound('Brand not found');
  const parsed = parseAttributes(key, value);
  if (!parsed.ok) throw AppError.badRequest(parsed.message);
  return parsed.data;
}

export const brandCatalogService = {
  // ── Profile ───────────────────────────────────────────────────────────────
  async profile(brandId: string): Promise<BrandProfileView> {
    const row = await repo.profile(brandId);
    if (!row) throw AppError.notFound('Brand not found');
    return {
      id: row.brand.id,
      name: row.brand.name,
      slug: row.brand.slug,
      status: row.brand.status,
      description: row.brand.description,
      logoUrl: row.brand.logoUrl,
      coverUrl: row.brand.coverUrl,
      contactPhone: row.brand.contactPhone,
      contactEmail: row.brand.contactEmail,
      businessType: { key: row.typeKey, name: row.typeName },
    };
  },

  /**
   * A brand edits its own presentation only. Name, slug, business type and
   * status are Haala's to set — a vendor renaming themselves or lifting their
   * own suspension is not an edit, it is a different decision.
   */
  async updateProfile(brandId: string, input: UpdateBrandProfileInput): Promise<BrandProfileView> {
    const updated = await repo.updateProfile(brandId, input);
    if (!updated) throw AppError.notFound('Brand not found');
    return this.profile(brandId);
  },

  // ── Categories ────────────────────────────────────────────────────────────
  async listCategories(brandId: string): Promise<BrandCategoryView[]> {
    const rows = await repo.listCategories(brandId);
    return rows.map(toCategoryView);
  },

  async createCategory(brandId: string, input: CreateCategoryInput): Promise<BrandCategoryView> {
    let slug: string;
    if (input.slug) {
      if (await repo.categorySlugTaken(brandId, input.slug)) {
        throw AppError.conflict(`You already have a category at "${input.slug}"`);
      }
      slug = input.slug;
    } else {
      slug = await freeSlug(brandId, input.name, repo.categorySlugTaken);
    }

    const created = await repo.createCategory(brandId, {
      name: input.name,
      slug,
      imageUrl: input.imageUrl ?? null,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    const row = await repo.findCategory(brandId, created.id);
    if (!row) throw new Error('Category vanished immediately after creation');
    return toCategoryView(row);
  },

  async updateCategory(
    brandId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<BrandCategoryView> {
    const updated = await repo.updateCategory(brandId, id, input);
    if (!updated) throw AppError.notFound('Category not found');
    const row = await repo.findCategory(brandId, id);
    if (!row) throw AppError.notFound('Category not found');
    return toCategoryView(row);
  },

  async deleteCategory(brandId: string, id: string): Promise<void> {
    const row = await repo.findCategory(brandId, id);
    if (!row) throw AppError.notFound('Category not found');
    // `products.category_id` is ON DELETE RESTRICT, so the database would
    // refuse this anyway — checked here to give a reason instead of a 500.
    if (row.productCount > 0) {
      throw AppError.conflict(
        `This category still holds ${row.productCount} product${row.productCount === 1 ? '' : 's'} — move or remove them first`,
      );
    }
    await repo.deleteCategory(brandId, id);
  },

  async reorderCategories(brandId: string, ids: string[]): Promise<BrandCategoryView[]> {
    const moved = await repo.reorderCategories(brandId, ids);
    // Silently ignoring ids from another brand would make the reorder look like
    // it worked while doing less than asked.
    if (moved !== ids.length) {
      throw AppError.notFound('One or more of those categories do not exist');
    }
    return this.listCategories(brandId);
  },

  // ── Products ──────────────────────────────────────────────────────────────
  async listProducts(brandId: string, categoryId?: string): Promise<BrandProductView[]> {
    const rows = await repo.listProducts(brandId, { categoryId: categoryId ?? undefined });
    return Promise.all(
      rows.map(async (r) => toProductView(r, await repo.listVariants(brandId, r.product.id))),
    );
  },

  async getProduct(brandId: string, id: string): Promise<BrandProductView> {
    const row = await repo.findProduct(brandId, id);
    if (!row) throw AppError.notFound('Product not found');
    return toProductView(row, await repo.listVariants(brandId, id));
  },

  async createProduct(brandId: string, input: CreateProductInput): Promise<BrandProductView> {
    // The category is re-read under this brand. A well-formed uuid belonging to
    // someone else must not file a product into their listing.
    const category = await repo.findCategory(brandId, input.categoryId);
    if (!category) throw AppError.notFound('Category not found');

    if (input.compareAtPrice != null && input.compareAtPrice <= input.basePrice) {
      throw AppError.badRequest('The original price must be higher than the price you charge');
    }

    const attributes = await checkAttributes(brandId, input.attributes);

    let slug: string;
    if (input.slug) {
      if (await repo.productSlugTaken(brandId, input.slug)) {
        throw AppError.conflict(`You already have a product at "${input.slug}"`);
      }
      slug = input.slug;
    } else {
      slug = await freeSlug(brandId, input.name, repo.productSlugTaken);
    }

    const created = await repo.createProduct(brandId, {
      categoryId: input.categoryId,
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      unit: input.unit,
      basePrice: input.basePrice,
      compareAtPrice: input.compareAtPrice ?? null,
      sku: input.sku ?? null,
      ...(attributes ? { attributes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    // Every product needs at least one sellable variant — inventory and cart
    // both key on variants, so a product without one cannot be bought.
    await repo.createVariant(brandId, created.id, {
      label: input.unit,
      unit: input.unit,
      basePrice: input.basePrice,
      sortOrder: 0,
    });

    return this.getProduct(brandId, created.id);
  },

  async updateProduct(
    brandId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<BrandProductView> {
    const existing = await repo.findProduct(brandId, id);
    if (!existing) throw AppError.notFound('Product not found');

    if (input.categoryId) {
      const category = await repo.findCategory(brandId, input.categoryId);
      if (!category) throw AppError.notFound('Category not found');
    }

    const basePrice = input.basePrice ?? existing.product.basePrice;
    const compareAt =
      input.compareAtPrice !== undefined ? input.compareAtPrice : existing.product.compareAtPrice;
    if (compareAt != null && compareAt <= basePrice) {
      throw AppError.badRequest('The original price must be higher than the price you charge');
    }

    const attributes = await checkAttributes(brandId, input.attributes);

    const updated = await repo.updateProduct(brandId, id, {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(attributes ? { attributes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!updated) throw AppError.notFound('Product not found');
    return this.getProduct(brandId, id);
  },

  async deleteProduct(brandId: string, id: string): Promise<void> {
    const row = await repo.findProduct(brandId, id);
    if (!row) throw AppError.notFound('Product not found');

    // `order_items.product_id` is ON DELETE RESTRICT: an ordered product is
    // part of somebody's receipt and cannot be erased. Deactivating is the
    // honest alternative, so say that rather than surfacing a constraint error.
    const orders = await repo.orderCountForProduct(brandId, id);
    if (orders > 0) {
      throw AppError.conflict(
        `This product appears in ${orders} order${orders === 1 ? '' : 's'} and cannot be deleted — switch it off instead`,
      );
    }
    await repo.deleteProduct(brandId, id);
  },

  // ── Variants ──────────────────────────────────────────────────────────────
  /**
   * `product_variants_default_uq` allows exactly one variant per product at
   * `sort_order = 0`, because the customer catalogue joins on that row to
   * resolve the price shown on a card. So a new size goes to the end unless the
   * caller insists otherwise — defaulting to 0 would collide with the product's
   * existing default and surface as a 500.
   */
  async addVariant(
    brandId: string,
    productId: string,
    input: CreateVariantInput,
  ): Promise<BrandProductView> {
    const existing = await repo.listVariants(brandId, productId);
    if (input.sortOrder === 0 && existing.some((v) => v.sortOrder === 0)) {
      throw AppError.conflict(
        'This product already has a default size — reorder the existing one first',
      );
    }
    const nextOrder =
      input.sortOrder ?? existing.reduce((max, v) => Math.max(max, v.sortOrder), 0) + 1;

    const created = await repo.createVariant(brandId, productId, {
      label: input.label,
      unit: input.unit,
      basePrice: input.basePrice,
      ...(input.options ? { options: input.options } : {}),
      sku: input.sku ?? null,
      sortOrder: nextOrder,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!created) throw AppError.notFound('Product not found');
    return this.getProduct(brandId, productId);
  },

  async updateVariant(
    brandId: string,
    productId: string,
    variantId: string,
    input: UpdateVariantInput,
  ): Promise<BrandProductView> {
    const updated = await repo.updateVariant(brandId, productId, variantId, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!updated) throw AppError.notFound('Variant not found');
    return this.getProduct(brandId, productId);
  },

  async removeVariant(
    brandId: string,
    productId: string,
    variantId: string,
  ): Promise<BrandProductView> {
    const variants = await repo.listVariants(brandId, productId);
    if (variants.length === 0) throw AppError.notFound('Product not found');
    if (!variants.some((v) => v.id === variantId)) throw AppError.notFound('Variant not found');
    if (variants.length === 1) {
      throw AppError.conflict(
        'A product needs at least one size — add another before removing this one',
      );
    }

    const stocked = await repo.inventoryCountForVariant(variantId);
    if (stocked > 0) {
      throw AppError.conflict(
        'This size is stocked in a Haala store — ask ops to clear it before removing',
      );
    }

    // Removing the default would leave the product with nothing at
    // `sort_order = 0`, and the catalogue card resolves its price from exactly
    // that row — the product would still exist and stop being shoppable. So the
    // next size is promoted in the same transaction.
    const removing = variants.find((v) => v.id === variantId);
    const promote =
      removing?.sortOrder === 0
        ? variants.filter((v) => v.id !== variantId).sort((a, b) => a.sortOrder - b.sortOrder)[0]
        : undefined;

    const removed = await repo.deleteVariantAndPromote(brandId, productId, variantId, promote?.id);
    if (!removed) throw AppError.notFound('Variant not found');
    return this.getProduct(brandId, productId);
  },
};
