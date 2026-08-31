/**
 * Canonical domain enums shared across backend and apps. Defined as `const`
 * objects + derived union types so they work as both values and types, and
 * stay in sync with the Drizzle pg enums.
 */

export const UserRole = {
  Customer: 'customer',
  Rider: 'rider',
  /** Haala operations staff: orders, riders, inventory. */
  Admin: 'admin',
  /** Haala operations staff, plus brands and business types. */
  SuperAdmin: 'super_admin',
  /** Scoped to exactly one brand's catalogue. Never sees another's. */
  BrandUser: 'brand_user',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * The roles that run Haala itself, as opposed to a single brand. Use this
 * rather than listing roles at each call site, so widening the staff set later
 * is one edit instead of a search.
 */
export const HAALA_STAFF_ROLES = [UserRole.Admin, UserRole.SuperAdmin] as const;

/** Only `active` brands may sell; everything else is invisible to customers. */
export const BrandStatus = {
  Pending: 'pending',
  Active: 'active',
  Suspended: 'suspended',
  Rejected: 'rejected',
} as const;
export type BrandStatus = (typeof BrandStatus)[keyof typeof BrandStatus];

/**
 * Order lifecycle. The customer-facing timeline maps onto this:
 * placed → confirmed → preparing → packed → picked_up → out_for_delivery → delivered.
 * `cancelled` / `failed` are terminal off-ramps.
 */
export const OrderStatus = {
  Placed: 'placed',
  Confirmed: 'confirmed',
  Preparing: 'preparing',
  Packed: 'packed',
  PickedUp: 'picked_up',
  OutForDelivery: 'out_for_delivery',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  Failed: 'failed',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Valid forward transitions — enforced in the Orders service. */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['packed', 'cancelled'],
  packed: ['picked_up', 'cancelled'],
  picked_up: ['out_for_delivery', 'failed'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: [],
  cancelled: [],
  failed: [],
};

export const PaymentMethod = {
  Cod: 'cod',
  Online: 'online',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  Pending: 'pending',
  Authorized: 'authorized',
  Paid: 'paid',
  Failed: 'failed',
  Refunded: 'refunded',
  PartiallyRefunded: 'partially_refunded',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RiderAvailability = {
  Offline: 'offline',
  Available: 'available',
  Busy: 'busy',
} as const;
export type RiderAvailability = (typeof RiderAvailability)[keyof typeof RiderAvailability];

/** Per-order delivery assignment lifecycle (rider app workflow). */
export const DeliveryStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
  EnRouteToStore: 'en_route_to_store',
  AtStore: 'at_store',
  PickedUp: 'picked_up',
  EnRouteToCustomer: 'en_route_to_customer',
  Arrived: 'arrived',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const AddressLabel = {
  Home: 'home',
  Work: 'work',
  Other: 'other',
} as const;
export type AddressLabel = (typeof AddressLabel)[keyof typeof AddressLabel];

export const PromotionType = {
  Percentage: 'percentage',
  FixedAmount: 'fixed_amount',
  FreeDelivery: 'free_delivery',
} as const;
export type PromotionType = (typeof PromotionType)[keyof typeof PromotionType];

/** Helper: all values of a const-enum object, typed. */
export const enumValues = <T extends Record<string, string>>(e: T): T[keyof T][] =>
  Object.values(e) as T[keyof T][];
