import type {
  AddCartItemInput,
  AddressView,
  AuthResult,
  AuthUser,
  CartView,
  CategoryView,
  CreateAddressInput,
  LoginInput,
  OrderSummaryView,
  OrderView,
  Paginated,
  PlaceOrderInput,
  PlaceOrderResult,
  ProductView,
  RegisterInput,
  StoreView,
} from '@haala/shared';
import { api } from './client';

const qs = (params: Record<string, string | number | undefined>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const authApi = {
  login: (input: LoginInput) => api.post<AuthResult>('/auth/login', input),
  register: (input: RegisterInput) => api.post<AuthResult>('/auth/register', input),
  refresh: (refreshToken: string) => api.post<AuthResult>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) => api.post<{ success: boolean }>('/auth/logout', { refreshToken }),
  me: () => api.get<AuthUser>('/users/me'),
};

export const storesApi = {
  nearby: (lat: number, lng: number) => api.get<StoreView[]>(`/stores${qs({ lat, lng })}`),
};

export const catalogApi = {
  categories: () => api.get<CategoryView[]>('/catalog/categories'),
  products: (params: { storeId: string; categoryId?: string; q?: string; page?: number }) =>
    api.get<Paginated<ProductView>>(`/catalog/products${qs(params)}`),
  product: (id: string, storeId: string) =>
    api.get<ProductView>(`/catalog/products/${id}${qs({ storeId })}`),
};

export const cartApi = {
  get: () => api.get<CartView>('/cart'),
  addItem: (input: AddCartItemInput) => api.post<CartView>('/cart/items', input),
  updateItem: (productId: string, quantity: number) =>
    api.patch<CartView>(`/cart/items/${productId}`, { quantity }),
  removeItem: (productId: string) => api.del<CartView>(`/cart/items/${productId}`),
  clear: () => api.del<CartView>('/cart'),
};

export const addressesApi = {
  list: () => api.get<AddressView[]>('/addresses'),
  create: (input: CreateAddressInput) => api.post<AddressView>('/addresses', input),
  setDefault: (id: string) => api.post<AddressView>(`/addresses/${id}/default`),
};

export const ordersApi = {
  list: () => api.get<OrderSummaryView[]>('/orders'),
  get: (id: string) => api.get<OrderView>(`/orders/${id}`),
  place: (input: PlaceOrderInput, idempotencyKey: string) =>
    api.post<PlaceOrderResult>('/orders', input, { 'Idempotency-Key': idempotencyKey }),
  cancel: (id: string) => api.post<OrderView>(`/orders/${id}/cancel`),
};
