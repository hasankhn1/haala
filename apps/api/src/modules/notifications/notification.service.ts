import { OrderStatus, type NotificationView, type OrderStatus as OrderStatusT } from '@haala/shared';
import { logger } from '../../common/logger';
import type { Notification } from '../../db/schema';
import { RealtimeEvents } from '../../realtime/events';
import { emitToUser } from '../../realtime/gateway';
import { haversineMeters } from '../../common/geo';
import { RIDER_PICKUP_RADIUS_METERS } from '../delivery/delivery.constants';
import { riderRepository } from '../riders/rider.repository';
import { storeRepository } from '../stores/store.repository';
import { notificationRepository } from './notification.repository';
import { sendPush, type PushMessage } from './push';

const toView = (n: Notification): NotificationView => ({
  id: n.id,
  title: n.title,
  body: n.body,
  type: n.type,
  data: (n.data ?? null) as Record<string, unknown> | null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  type?: string;
  data?: Record<string, unknown>;
}

/**
 * Customer-facing copy for each order transition.
 *
 * Only the statuses a customer benefits from hearing about are here.
 * `confirmed` and `preparing` are deliberately absent — on a 15-minute promise
 * they'd fire within seconds of `placed`, and three buzzes in a row for one
 * order trains people to mute the app.
 */
const ORDER_COPY: Partial<Record<OrderStatusT, { title: string; body: string }>> = {
  [OrderStatus.Packed]: {
    title: 'Your order is packed',
    body: 'A rider is on the way to collect it.',
  },
  [OrderStatus.PickedUp]: {
    title: 'Your order is on its way',
    body: 'Your rider has picked it up.',
  },
  [OrderStatus.OutForDelivery]: {
    title: 'Out for delivery',
    body: 'Your rider is heading to you now.',
  },
  [OrderStatus.Delivered]: {
    title: 'Delivered',
    body: 'Enjoy! Tap to rate your order.',
  },
  [OrderStatus.Cancelled]: {
    title: 'Order cancelled',
    body: 'Your order was cancelled. Any payment will be refunded.',
  },
  [OrderStatus.Failed]: {
    title: 'Delivery failed',
    body: 'We could not complete your delivery. Support will be in touch.',
  },
};

export const notificationService = {
  /**
   * Persist a notification, push it to the user's live sockets, and send it to
   * their devices.
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
        type: input.type ?? 'system',
        data: input.data ?? null,
      });
      const view = toView(row);

      emitToUser(input.userId, RealtimeEvents.NotificationCreated, view);
      await this.pushToUsers([input.userId], {
        title: input.title,
        body: input.body,
        data: { ...(input.data ?? {}), notificationId: row.id, type: view.type },
      });

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
  async pushToUsers(
    userIds: string[],
    message: Omit<PushMessage, 'to'>,
  ): Promise<void> {
    try {
      const tokens = await notificationRepository.tokensForUsers(userIds);
      if (tokens.length === 0) return;

      const { sent, invalidTokens } = await sendPush(
        tokens.map((t) => ({ ...message, to: t.token, channelId: 'default' })),
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
   * Notify a customer that their order moved. Silent for statuses with no copy.
   * Fire-and-forget by design — see `create`.
   */
  async notifyOrderStatus(
    userId: string,
    orderId: string,
    orderNumber: string,
    status: OrderStatusT,
  ): Promise<void> {
    const copy = ORDER_COPY[status];
    if (!copy) return;
    await this.create({
      userId,
      title: copy.title,
      body: copy.body,
      type: 'order_update',
      data: { orderId, orderNumber, status },
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

  async list(userId: string): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      notificationRepository.listByUser(userId),
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

  async registerToken(userId: string, token: string, platform: string | null): Promise<void> {
    await notificationRepository.upsertToken(userId, token, platform);
  },

  async unregisterToken(userId: string, token: string): Promise<void> {
    await notificationRepository.deleteToken(userId, token);
  },
};
