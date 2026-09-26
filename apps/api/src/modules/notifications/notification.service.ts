import {
  DeliveryStatus,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNEL,
  NotificationCategory,
  notificationCategory,
  notificationTypesIn,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  type NotificationPreferencesView,
  type NotificationView,
  type UpdateNotificationPreferencesInput,
} from '@haala/shared';
import { logger } from '../../common/logger';
import type {
  DeliveryAssignment,
  Notification,
  NotificationPreferences,
  Order,
  Payment,
} from '../../db/schema';
import { RealtimeEvents } from '../../realtime/events';
import { emitToUser } from '../../realtime/gateway';
import { haversineMeters } from '../../common/geo';
import { ARRIVING_RADIUS_METERS, RIDER_PICKUP_RADIUS_METERS } from '../delivery/delivery.constants';
import { deliveryRepository } from '../delivery/delivery.repository';
import { orderRepository } from '../orders/order.repository';
import { riderRepository } from '../riders/rider.repository';
import { storeRepository } from '../stores/store.repository';
import { userRepository } from '../users/user.repository';
import { copy, type Copy } from './notification.copy';
import { DEFAULT_PREFERENCES, shouldPush } from './notification.policy';
import { notificationRepository } from './notification.repository';
import { sendPush, type PushMessage } from './push';

const toView = (n: Notification): NotificationView => ({
  id: n.id,
  title: n.title,
  body: n.body,
  type: n.type,
  category: notificationCategory(n.type),
  data: (n.data ?? null) as Record<string, unknown> | null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/** Where each category's switch is stored. */
const PREFERENCE_COLUMN = {
  order: 'orderUpdates',
  brand: 'brandOrders',
  payment: 'payments',
  offer: 'offers',
  service: 'service',
} as const satisfies Record<NotificationCategory, keyof NotificationPreferences>;
type PreferenceColumn = (typeof PREFERENCE_COLUMN)[NotificationCategory] | 'quietHours';

const toPreferencesView = (
  row: NotificationPreferences | undefined,
): NotificationPreferencesView =>
  row
    ? {
        categories: {
          order: row.orderUpdates,
          brand: row.brandOrders,
          payment: row.payments,
          offer: row.offers,
          service: row.service,
        },
        quietHours: row.quietHours,
      }
    : DEFAULT_PREFERENCES;

export interface CreateNotificationInput extends Copy {
  userId: string;
  data?: Record<string, unknown>;
}

const riderName = async (riderUserId: string | null): Promise<string | null> =>
  riderUserId ? ((await userRepository.findById(riderUserId))?.name ?? null) : null;

/**
 * Every trigger below runs alongside an order, delivery or payment transition
 * and is called without awaiting. A lookup failing here must not surface as a
 * failed transition, so each one is contained and logged.
 */
const contained = async (what: string, ctx: Record<string, unknown>, run: () => Promise<void>) => {
  try {
    await run();
  } catch (err) {
    logger.warn({ err, ...ctx }, `Could not notify: ${what}`);
  }
};

export const notificationService = {
  /**
   * Persist a notification, push it to the user's live sockets, and — if their
   * preferences allow it right now — send it to their devices.
   *
   * Never throws: callers invoke this alongside order transitions, and a push
   * failure must not surface as a failed delivery. Errors are logged instead.
   */
  async create(input: CreateNotificationInput): Promise<NotificationView | null> {
    try {
      const row = await notificationRepository.create({
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type,
        data: input.data ?? null,
      });
      const view = toView(row);
      emitToUser(input.userId, RealtimeEvents.NotificationCreated, view);

      const prefs = await this.preferences(input.userId);
      if (shouldPush(view.category, prefs, new Date())) {
        await this.pushToUsers([input.userId], {
          title: input.title,
          body: input.body,
          data: {
            ...(input.data ?? {}),
            notificationId: row.id,
            type: view.type,
            category: view.category,
          },
          channelId: NOTIFICATION_CHANNEL[view.category],
          // Offers are the one silent category, on iOS as on Android's channel.
          sound: view.category === NotificationCategory.Offer ? null : 'default',
        });
      }

      return view;
    } catch (err) {
      logger.warn({ err, userId: input.userId }, 'Could not create notification');
      return null;
    }
  },

  /**
   * Push to devices without storing an inbox row. Used for rider fan-out, where
   * "a new order is claimable" is worth a buzz but pointless to keep — by the
   * time anyone reads an inbox, another rider has taken it.
   */
  async pushToUsers(userIds: string[], message: Omit<PushMessage, 'to'>): Promise<void> {
    try {
      const tokens = await notificationRepository.tokensForUsers(userIds);
      if (tokens.length === 0) return;

      const { sent, invalidTokens } = await sendPush(
        tokens.map((t) => ({ channelId: 'default', ...message, to: t.token })),
      );

      // Prune dead tokens rather than retrying them on every future order.
      if (invalidTokens.length > 0) {
        await notificationRepository.deleteTokens(invalidTokens);
        logger.info({ count: invalidTokens.length }, 'Pruned unregistered push tokens');
      }
      logger.debug({ sent, recipients: userIds.length }, 'Push dispatched');
    } catch (err) {
      logger.warn({ err }, 'Push dispatch failed');
    }
  },

  /**
   * Notify a customer that their order moved.
   *
   * Only four transitions speak. `placed` through `packed` are silent — on a
   * 15-minute promise they land within seconds of each other, and the rider
   * claiming the order (`notifyRiderAssigned`) says everything `packed` did.
   * `out_for_delivery` is silent because it follows pickup almost at once, and
   * pickup is when the design says "Raaste mein hai".
   */
  async notifyOrderStatus(order: Order): Promise<void> {
    await contained('order status', { orderId: order.id, status: order.status }, async () => {
      let message: Copy;
      switch (order.status) {
        case OrderStatus.PickedUp:
          message = copy.outForDelivery(await riderName(order.riderId));
          break;
        case OrderStatus.Delivered: {
          const at = order.deliveredAt ?? new Date();
          const minutes = Math.round((at.getTime() - order.placedAt.getTime()) / 60_000);
          const units = await orderRepository.unitCounts([order.id]);
          message = copy.delivered(minutes, units.get(order.id) ?? 0, at);
          break;
        }
        case OrderStatus.Cancelled:
          message = copy.orderCancelled(order.orderNumber);
          break;
        case OrderStatus.Failed:
          message = copy.deliveryFailed(order.orderNumber);
          break;
        default:
          return;
      }
      await this.create({
        userId: order.userId,
        ...message,
        data: { orderId: order.id, orderNumber: order.orderNumber, status: order.status },
      });
    });
  },

  /** A rider claimed the order: the first thing worth a buzz after placing it. */
  async notifyRiderAssigned(order: Order, riderUserId: string): Promise<void> {
    await contained('rider assigned', { orderId: order.id }, async () => {
      const [name, store] = await Promise.all([
        riderName(riderUserId),
        storeRepository.findById(order.storeId),
      ]);
      if (!store) return;
      await this.create({
        userId: order.userId,
        ...copy.riderAssigned(name, store.name),
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
    });
  },

  /**
   * Called on every location ping from a rider carrying an order; speaks once,
   * when they first come within `ARRIVING_RADIUS_METERS` of the drop-off.
   */
  async notifyIfArriving(
    order: Order,
    assignment: DeliveryAssignment,
    at: { lat: number; lng: number },
  ): Promise<void> {
    // Only on the way: pings keep coming after the rider taps "Arrived", and a
    // first ping inside the radius then would say "Arriving" after "has arrived".
    const enRoute =
      assignment.status === DeliveryStatus.PickedUp ||
      assignment.status === DeliveryStatus.EnRouteToCustomer;
    if (!enRoute || assignment.arrivingNotifiedAt) return;
    const { latitude, longitude } = order.deliveryAddress;
    if (haversineMeters(at.lat, at.lng, latitude, longitude) > ARRIVING_RADIUS_METERS) return;
    await contained('arriving', { orderId: order.id }, async () => {
      if (!(await deliveryRepository.markArrivingNotified(assignment.id))) return;
      await this.create({
        userId: order.userId,
        ...copy.arriving(await riderName(assignment.riderId)),
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
    });
  },

  /**
   * The rider is at the door. `arrived` has no order-status equivalent, so it
   * comes from the delivery side rather than `notifyOrderStatus`.
   */
  async notifyArrived(customerUserId: string, orderId: string, riderUserId: string): Promise<void> {
    await contained('arrived', { orderId }, async () => {
      await this.create({
        userId: customerUserId,
        ...copy.arrived(await riderName(riderUserId)),
        data: { orderId },
      });
    });
  },

  /**
   * An online payment settled. Call only on an actual change of status —
   * gateways retry webhooks, and every retry would otherwise buzz again.
   * COD is never announced: the customer is handing the cash over in person.
   */
  async notifyPaymentOutcome(payment: Payment): Promise<void> {
    if (payment.method !== PaymentMethod.Online) return;
    if (payment.status !== PaymentStatus.Paid && payment.status !== PaymentStatus.Failed) return;
    await contained('payment outcome', { paymentId: payment.id }, async () => {
      const order = await orderRepository.findById(payment.orderId);
      if (!order) return;
      await this.create({
        userId: order.userId,
        ...(payment.status === PaymentStatus.Paid
          ? copy.paymentReceived(payment.amount, order.orderNumber)
          : copy.paymentFailed(payment.amount, order.orderNumber)),
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
    });
  },

  async notifyRefund(orderId: string, amount: number): Promise<void> {
    await contained('refund', { orderId }, async () => {
      const order = await orderRepository.findById(orderId);
      if (!order) return;
      await this.create({
        userId: order.userId,
        ...copy.refundIssued(amount),
        data: { orderId: order.id, orderNumber: order.orderNumber },
      });
    });
  },

  /**
   * Tell riders a pickup just became claimable.
   *
   * Deliberately push-only with no inbox row: the pool is first-come, so by the
   * time anyone opens an inbox another rider has taken it, and a list of stale
   * "order available" entries is worse than nothing.
   *
   * Scoping mirrors `deliveryService.eligibleStores` from the store's side —
   * riders whose home store this is, plus unassigned riders within the pickup
   * radius. Notifying a rider about a pickup they can't claim would be noise
   * that teaches them to ignore the next one.
   *
   * Lives here rather than in the delivery service to avoid an
   * order → delivery → order import cycle; it only needs repositories and the
   * shared radius constant.
   */
  async notifyRidersOfClaimableOrder(
    storeId: string,
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    try {
      const [candidates, store] = await Promise.all([
        riderRepository.availableForStore(storeId),
        storeRepository.findById(storeId),
      ]);
      if (!store || candidates.length === 0) return;

      const eligible = candidates.filter((r) => {
        if (r.storeId === storeId) return true;
        // Unassigned riders are scoped by proximity, so they need a position.
        if (r.currentLat === null || r.currentLng === null) return false;
        return (
          haversineMeters(r.currentLat, r.currentLng, store.latitude, store.longitude) <=
          RIDER_PICKUP_RADIUS_METERS
        );
      });
      if (eligible.length === 0) return;

      await this.pushToUsers(
        eligible.map((r) => r.userId),
        {
          title: 'New order available',
          body: `Order ${orderNumber} is ready for pickup at ${store.name}.`,
          data: { orderId, storeId, type: 'claimable_order' },
        },
      );
    } catch (err) {
      logger.warn({ err, storeId, orderId }, 'Could not notify riders of claimable order');
    }
  },

  async list(
    userId: string,
    category?: NotificationCategory,
  ): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      notificationRepository.listByUser(
        userId,
        category ? notificationTypesIn(category) : undefined,
      ),
      notificationRepository.unreadCount(userId),
    ]);
    return { items: rows.map(toView), unreadCount };
  },

  async markRead(userId: string, id: string): Promise<void> {
    await notificationRepository.markRead(id, userId);
  },

  async markAllRead(userId: string): Promise<number> {
    return notificationRepository.markAllRead(userId);
  },

  async preferences(userId: string): Promise<NotificationPreferencesView> {
    return toPreferencesView(await notificationRepository.findPreferences(userId));
  },

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferencesView> {
    const patch: Partial<Record<PreferenceColumn, boolean>> = {};
    for (const category of NOTIFICATION_CATEGORIES) {
      const enabled = input.categories?.[category];
      if (enabled !== undefined) patch[PREFERENCE_COLUMN[category]] = enabled;
    }
    if (input.quietHours !== undefined) patch.quietHours = input.quietHours;
    return toPreferencesView(await notificationRepository.upsertPreferences(userId, patch));
  },

  async registerToken(userId: string, token: string, platform: string | null): Promise<void> {
    await notificationRepository.upsertToken(userId, token, platform);
  },

  async unregisterToken(userId: string, token: string): Promise<void> {
    await notificationRepository.deleteToken(userId, token);
  },
};
