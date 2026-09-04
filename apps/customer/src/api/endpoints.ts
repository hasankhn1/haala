import type {
  AddCartItemInput,
  AddressView,
  AuthResult,
  AuthUser,
  CartView,
  CategoryView,
  CreateAddressInput,
  EmailAuthInput,
  EmailAuthResult,
  LoginInput,
  OrderSummaryView,
  OrderView,
  Paginated,
  PlaceOrderInput,
  PlaceOrderResult,
  NotificationListView,
  PaymentStatus,
  ProductView,
  PromoQuoteView,
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
  /** Signs in, or creates the account — `created` says which. */
  email: (input: EmailAuthInput) => api.post<EmailAuthResult>('/auth/email', input),
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
  updateItem: (variantId: string, quantity: number) =>
    api.patch<CartView>(`/cart/items/${variantId}`, { quantity }),
  removeItem: (variantId: string) => api.del<CartView>(`/cart/items/${variantId}`),
  clear: () => api.del<CartView>('/cart'),
};

export const addressesApi = {
  list: () => api.get<AddressView[]>('/addresses'),
  create: (input: CreateAddressInput) => api.post<AddressView>('/addresses', input),
  setDefault: (id: string) => api.post<AddressView>(`/addresses/${id}/default`),
};

export const notificationsApi = {
  list: () => api.get<NotificationListView>('/notifications'),
  markRead: (id: string) => api.post<{ success: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ success: boolean; count: number }>('/notifications/read-all'),
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    api.post<{ success: boolean }>('/notifications/push-token', { token, platform }),
  unregisterPushToken: (token: string) =>
    api.del<{ success: boolean }>('/notifications/push-token', { token }),
};

export const paymentsApi = {
  /**
   * Ask the server to re-check the gateway. Called after the hosted checkout
   * closes — the browser returning proves only that a tab shut, so the client
   * never asserts success. The webhook remains authoritative; this exists so a
   * customer who paid isn't left staring at "pending".
   */
  verify: (orderId: string) =>
    api.post<{ status: PaymentStatus }>(`/payments/${orderId}/verify`),
  status: (orderId: string) => api.get<{ status: PaymentStatus }>(`/payments/${orderId}/status`),
};

export const promotionsApi = {
  /**
   * Price a code against the server's view of the cart. The server re-prices at
   * placement, so this is a preview — but it comes from the same `quote()` the
   * charge uses, so the two cannot disagree.
   */
  validate: (code: string) => api.post<PromoQuoteView>('/promotions/validate', { code }),
};

export const ordersApi = {
  list: () => api.get<OrderSummaryView[]>('/orders'),
  get: (id: string) => api.get<OrderView>(`/orders/${id}`),
  place: (input: PlaceOrderInput, idempotencyKey: string) =>
    api.post<PlaceOrderResult>('/orders', input, { 'Idempotency-Key': idempotencyKey }),
  cancel: (id: string) => api.post<OrderView>(`/orders/${id}/cancel`),
};
