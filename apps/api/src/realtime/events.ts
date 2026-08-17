import type { DeliveryStatus, OrderStatus } from '@haala/shared';

/** Server → client realtime event names. */
export const RealtimeEvents = {
  OrderStatusUpdated: 'order:status_updated',
  DeliveryStatusUpdated: 'delivery:status_updated',
  RiderLocationUpdated: 'rider:location_updated',
  OrderAssigned: 'order:assigned',
  NotificationCreated: 'notification:created',
} as const;

export interface OrderStatusUpdatedPayload {
  orderId: string;
  status: OrderStatus;
  at: string; // ISO timestamp
}

export interface DeliveryStatusUpdatedPayload {
  orderId: string;
  status: DeliveryStatus;
  at: string;
}

export interface RiderLocationUpdatedPayload {
  orderId: string;
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}
