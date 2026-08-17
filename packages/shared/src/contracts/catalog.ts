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

export interface ProductView {
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
}
