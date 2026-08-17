export const qk = {
  me: ['me'] as const,
  stores: (lat: number, lng: number) => ['stores', lat, lng] as const,
  categories: ['categories'] as const,
  products: (storeId: string, categoryId?: string, q?: string) =>
    ['products', storeId, categoryId ?? null, q ?? null] as const,
  product: (id: string, storeId: string) => ['product', id, storeId] as const,
  cart: ['cart'] as const,
  addresses: ['addresses'] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
};
