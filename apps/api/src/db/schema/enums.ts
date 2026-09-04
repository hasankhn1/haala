import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Postgres enums. Values MUST mirror the const enums in `@haala/shared`.
 * (Kept as literal tuples here because pgEnum needs a readonly string tuple.)
 */
/**
 * `admin` and `super_admin` are both Haala staff; `super_admin` additionally
 * manages brands and business types. `admin` was deliberately **not** renamed —
 * every existing ops route, session and seeded account keeps working, and the
 * ops routes simply accept either.
 *
 * A `brand_user` is scoped to exactly one brand. The `users_brand_role_ck`
 * constraint makes that a database invariant rather than a convention.
 */
export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'rider',
  'admin',
  'super_admin',
  'brand_user',
]);

/**
 * How a customer proves who they are. See `auth_providers`.
 *
 * `phone` is the original phone+password login, kept as one provider among
 * several rather than a special case. `apple` is accepted by the model and the
 * server before any button exists, so adding it later is a screen change.
 */
export const authProviderEnum = pgEnum('auth_provider', [
  'phone',
  'email',
  'google',
  'apple',
]);

/**
 * Only `active` may sell. `pending` exists so an application-and-approval flow
 * is a UI addition later rather than a migration — brands are created directly
 * by a super admin today.
 */
export const brandStatusEnum = pgEnum('brand_status', [
  'pending',
  'active',
  'suspended',
  'rejected',
]);

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
