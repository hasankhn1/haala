import type {
  AdvanceDeliveryInput,
  AuthResult,
  AuthUser,
  DeliveryAssignmentView,
  LoginInput,
  RiderLocationInput,
  RiderQueueView,
  RiderView,
  UpdateAvailabilityInput,
  UpdateRiderProfileInput,
} from '@haala/shared';
import { api } from './client';

export const authApi = {
  login: (input: LoginInput) => api.post<AuthResult>('/auth/login', input),
  refresh: (refreshToken: string) => api.post<AuthResult>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) =>
    api.post<{ success: boolean }>('/auth/logout', { refreshToken }),
  me: () => api.get<AuthUser>('/users/me'),
};

export const riderApi = {
  me: () => api.get<RiderView>('/riders/me'),
  updateProfile: (input: UpdateRiderProfileInput) => api.patch<RiderView>('/riders/me', input),
  setAvailability: (input: UpdateAvailabilityInput) =>
    api.patch<RiderView>('/riders/me/availability', input),
  pushLocation: (input: RiderLocationInput) => api.post<RiderView>('/riders/me/location', input),
  queue: () => api.get<RiderQueueView>('/riders/me/queue'),
};

export const deliveryApi = {
  list: () => api.get<DeliveryAssignmentView[]>('/delivery/assignments'),
  claim: (orderId: string) =>
    api.post<DeliveryAssignmentView>('/delivery/assignments', { orderId }),
  advance: (id: string, input: AdvanceDeliveryInput) =>
    api.post<DeliveryAssignmentView>(`/delivery/assignments/${id}/status`, input),
  collectCod: (id: string) =>
    api.post<DeliveryAssignmentView>(`/delivery/assignments/${id}/collect-cod`),
};

export const notificationsApi = {
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    api.post<{ success: boolean }>('/notifications/push-token', { token, platform }),
  unregisterPushToken: (token: string) =>
    api.del<{ success: boolean }>('/notifications/push-token', { token }),
};
