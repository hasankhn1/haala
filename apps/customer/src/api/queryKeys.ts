export const qk = {
  me: ['me'] as const,
  myProviders: ['me', 'providers'] as const,
  stores: (lat: number, lng: number) => ['stores', lat, lng] as const,
  /**
   * Department-scoped, and the key must say so. Sharing one key across
   * departments is how Clothing came to render the grocery aisles: whichever
   * screen loaded first filled the cache for both.
   */
  categories: (department?: string) => ['categories', department ?? null] as const,
  departments: ['departments'] as const,
  /** Keyed by store: prices and stock differ, so the caches must not be shared. */
  home: (storeId?: string | null) => ['home', storeId ?? null] as const,
  /**
   * Per store *and* implicitly per customer — the query is only enabled when
   * signed in, and sign-out clears the whole cache, so the customer need not
   * be in the key.
   */
  recentlyOrdered: (storeId?: string | null) => ['recently-ordered', storeId ?? null] as const,
  products: (storeId: string, categoryId?: string, q?: string, department?: string) =>
    ['products', storeId, categoryId ?? null, q ?? null, department ?? null] as const,
  product: (id: string, storeId: string) => ['product', id, storeId] as const,
  cart: ['cart'] as const,
  addresses: ['addresses'] as const,
  orders: ['orders'] as const,
  promo: (code: string) => ['promo', code] as const,
  notifications: ['notifications'] as const,
  order: (id: string) => ['order', id] as const,
};
