import { z } from 'zod';

export const registerPushTokenSchema = z
  .object({
    /** Expo push token, e.g. `ExponentPushToken[xxxxxxxx]`. */
    token: z.string().min(10).max(256),
    platform: z.enum(['ios', 'android']).optional(),
    /**
     * Android channel ids this build created. Optional, because a build that
     * predates channels does not send it — and its absence is the signal that
     * the handset has only `default`.
     */
    channels: z.array(z.string().min(1).max(40)).max(10).optional(),
  })
  .strict();
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({ token: z.string().min(10).max(256) }).strict();
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;

/**
 * What a notification is *about*, from the customer's side. Drives the inbox
 * filter, the tile colour, the Android channel and the preference that gates
 * the push — one axis, so those four can never disagree.
 */
export const NotificationCategory = {
  Order: 'order',
  Brand: 'brand',
  Payment: 'payment',
  Offer: 'offer',
  Service: 'service',
} as const;
export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NOTIFICATION_CATEGORIES = [
  NotificationCategory.Order,
  NotificationCategory.Brand,
  NotificationCategory.Payment,
  NotificationCategory.Offer,
  NotificationCategory.Service,
] as const;

/**
 * Template keys, stored in `notifications.type`. One per piece of copy, so the
 * client can vary presentation (the red failed-payment tile, the "Haala rider"
 * tag) without parsing titles.
 */
export const NotificationType = {
  RiderAssigned: 'rider_assigned',
  OutForDelivery: 'out_for_delivery',
  Arriving: 'arriving',
  Arrived: 'arrived',
  Delivered: 'delivered',
  OrderCancelled: 'order_cancelled',
  DeliveryFailed: 'delivery_failed',
  PaymentReceived: 'payment_received',
  PaymentFailed: 'payment_failed',
  RefundIssued: 'refund_issued',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/**
 * Category for every type, including the three generic types rows were written
 * with before templates existed. Those rows are still in people's inboxes, so
 * they must keep resolving rather than fall through to the default.
 */
const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  [NotificationType.RiderAssigned]: NotificationCategory.Order,
  [NotificationType.OutForDelivery]: NotificationCategory.Order,
  [NotificationType.Arriving]: NotificationCategory.Order,
  [NotificationType.Arrived]: NotificationCategory.Order,
  [NotificationType.Delivered]: NotificationCategory.Order,
  [NotificationType.OrderCancelled]: NotificationCategory.Order,
  [NotificationType.DeliveryFailed]: NotificationCategory.Order,
  [NotificationType.PaymentReceived]: NotificationCategory.Payment,
  [NotificationType.PaymentFailed]: NotificationCategory.Payment,
  [NotificationType.RefundIssued]: NotificationCategory.Payment,
  order_update: NotificationCategory.Order,
  promo: NotificationCategory.Offer,
  system: NotificationCategory.Service,
};

export const notificationCategory = (type: string): NotificationCategory =>
  CATEGORY_BY_TYPE[type] ?? NotificationCategory.Service;

/** Every stored type that belongs to `category` — what the inbox filter matches on. */
export const notificationTypesIn = (category: NotificationCategory): string[] =>
  Object.keys(CATEGORY_BY_TYPE).filter((t) => CATEGORY_BY_TYPE[t] === category);

/**
 * Categories that can actually carry a notification today.
 *
 * `brand` is declared everywhere — inbox filter, preference switch, Android
 * channel — and no type maps to it yet, because nothing sends brand-order
 * notifications. Offering it anyway gives the customer a filter chip that
 * answers "Nothing here yet" forever, a switch that writes to a column nothing
 * reads, and a channel in Android's own settings that never fires.
 *
 * Deriving the surfaces from this instead of listing categories by hand means
 * they light up on their own the day a brand type is added to
 * `CATEGORY_BY_TYPE`, rather than being dead wiring somebody has to remember.
 */
export const activeNotificationCategories = (): NotificationCategory[] =>
  NOTIFICATION_CATEGORIES.filter((c) => notificationTypesIn(c).length > 0);

/**
 * Android channel per category. Order updates keep the id `default` because
 * that channel already exists on installed handsets — and on the rider app —
 * and Android never lets an app change a channel's importance once created, so
 * a new id would strand the old one in system settings.
 */
export const NOTIFICATION_CHANNEL: Record<NotificationCategory, string> = {
  order: 'default',
  brand: 'brand_orders',
  payment: 'payments',
  offer: 'offers',
  service: 'service',
};

/**
 * Quiet hours, Pakistan time. Fixed rather than per-customer: the setting is on
 * or off, and the window is the one the design states. Only these categories
 * are held back — an order or payment update is never "noise".
 */
export const QUIET_HOURS = {
  startHour: 23,
  endHour: 8,
  /** Jummah, Friday 1–2 PM. */
  jummah: { day: 5, startHour: 13, endHour: 14 },
  mutes: [
    NotificationCategory.Offer,
    NotificationCategory.Service,
  ] as readonly NotificationCategory[],
} as const;

export const listNotificationsQuerySchema = z
  .object({ category: z.enum(NOTIFICATION_CATEGORIES).optional() })
  .strict();
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  /** A `NotificationType`, or a legacy generic type on older rows. */
  type: string;
  category: NotificationCategory;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListView {
  items: NotificationView[];
  /** Across every category — it feeds the badge, not the filtered list. */
  unreadCount: number;
}

export interface NotificationPreferencesView {
  /** Whether each category may push. The inbox row is written regardless. */
  categories: Record<NotificationCategory, boolean>;
  quietHours: boolean;
}

export const updateNotificationPreferencesSchema = z
  .object({
    categories: z
      .object({
        order: z.boolean(),
        brand: z.boolean(),
        payment: z.boolean(),
        offer: z.boolean(),
        service: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    quietHours: z.boolean().optional(),
  })
  .strict();
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
