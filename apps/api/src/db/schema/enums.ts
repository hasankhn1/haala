import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Postgres enums. Values MUST mirror the const enums in `@haala/shared`.
 * (Kept as literal tuples here because pgEnum needs a readonly string tuple.)
 */
export const userRoleEnum = pgEnum('user_role', ['customer', 'rider', 'admin']);

export const orderStatusEnum = pgEnum('order_status', [
  'placed',
  'confirmed',
  'preparing',
  'packed',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['cod', 'online']);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'authorized',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const riderAvailabilityEnum = pgEnum('rider_availability', [
  'offline',
  'available',
  'busy',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'accepted',
  'rejected',
  'en_route_to_store',
  'at_store',
  'picked_up',
  'en_route_to_customer',
  'arrived',
  'completed',
  'cancelled',
]);

export const addressLabelEnum = pgEnum('address_label', ['home', 'work', 'other']);

export const promotionTypeEnum = pgEnum('promotion_type', [
  'percentage',
  'fixed_amount',
  'free_delivery',
]);
