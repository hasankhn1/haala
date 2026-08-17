import {
  DELIVERY_STATUS_FLOW,
  DeliveryStatus,
  OrderStatus,
  RiderAvailability,
  type AdvanceDeliveryInput,
  type DeliveryAssignmentView,
  type DeliveryOrderView,
  type DeliveryStatus as DeliveryStatusT,
  type PoolScope,
  type RiderQueueView,
  type UpdateOrderStatusInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { haversineMeters } from '../../common/geo';
import { logger } from '../../common/logger';
import { db } from '../../db/client';
import type { DeliveryAssignment, Order, Store } from '../../db/schema';
import { RealtimeEvents } from '../../realtime/events';
import { emitToOrder, emitToUser } from '../../realtime/gateway';
import { orderRepository } from '../orders/order.repository';
import { orderService } from '../orders/order.service';
import { riderRepository } from '../riders/rider.repository';
import { storeRepository } from '../stores/store.repository';
import { userRepository } from '../users/user.repository';
import { deliveryRepository } from './delivery.repository';

/**
 * Delivery status → the order status it implies. Advancing the delivery is the
 * rider's single action; the customer-visible order status follows from it, so
 * the two can never drift apart.
 */
const ORDER_STATUS_FOR: Partial<Record<DeliveryStatusT, UpdateOrderStatusInput['status']>> = {
  [DeliveryStatus.PickedUp]: OrderStatus.PickedUp,
  [DeliveryStatus.EnRouteToCustomer]: OrderStatus.OutForDelivery,
  [DeliveryStatus.Completed]: OrderStatus.Delivered,
};

/**
 * How far an *unassigned* rider may be from a store and still be offered its
 * pickups. Riders with a home store ignore this — their assignment is the
 * scope. Generous enough to cover a city sector, tight enough that a rider is
 * never offered a pickup across town.
 */
const RIDER_PICKUP_RADIUS_METERS = 8_000;

/** Assignment states in which the rider counts as busy. */
const BUSY_STATUSES: DeliveryStatusT[] = [
  DeliveryStatus.Accepted,
  DeliveryStatus.EnRouteToStore,
  DeliveryStatus.AtStore,
  DeliveryStatus.PickedUp,
  DeliveryStatus.EnRouteToCustomer,
  DeliveryStatus.Arrived,
];

const emitDelivery = (assignment: DeliveryAssignment, customerUserId: string): void => {
  const payload = {
    orderId: assignment.orderId,
    status: assignment.status,
    at: new Date().toISOString(),
  };
  emitToOrder(assignment.orderId, RealtimeEvents.DeliveryStatusUpdated, payload);
  emitToUser(customerUserId, RealtimeEvents.DeliveryStatusUpdated, payload);
};

export const deliveryService = {
  /** Build the rider-facing view of an order: who, where, what, how much. */
  async buildOrderView(order: Order): Promise<DeliveryOrderView> {
    const [items, customer, store] = await Promise.all([
      orderRepository.items(order.id),
      userRepository.findById(order.userId),
      storeRepository.findById(order.storeId),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod: order.paymentMethod,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      items: items.map((i) => ({ name: i.name, unit: i.unit, quantity: i.quantity })),
      customerName: customer?.name ?? 'Customer',
      customerPhone: customer?.phone ?? '',
      dropoff: order.deliveryAddress,
      pickup: store
        ? {
            storeId: store.id,
            name: store.name,
            area: store.area,
            city: store.city,
            latitude: store.latitude,
            longitude: store.longitude,
          }
        : null,
    };
  },

  async buildAssignmentView(assignment: DeliveryAssignment): Promise<DeliveryAssignmentView> {
    const order = await orderRepository.findById(assignment.orderId);
    if (!order) throw AppError.notFound('Order not found for this assignment');
    return {
      id: assignment.id,
      status: assignment.status,
      codAmount: assignment.codAmount,
      codCollected: assignment.codCollected,
      assignedAt: assignment.assignedAt.toISOString(),
      acceptedAt: assignment.acceptedAt?.toISOString() ?? null,
      pickedUpAt: assignment.pickedUpAt?.toISOString() ?? null,
      deliveredAt: assignment.deliveredAt?.toISOString() ?? null,
      order: await this.buildOrderView(order),
    };
  },

  /**
   * Which stores may this rider collect from, and why.
   *
   * An assigned rider sees exactly their home store. An unassigned one is
   * matched by proximity to their last known position — never globally, or a
   * rider is offered pickups from a store they can't reach. With neither an
   * assignment nor a position we genuinely cannot answer, so the pool is empty
   * and `scope` says so rather than leaving the rider staring at a blank list.
   */
  async eligibleStores(rider: {
    storeId: string | null;
    currentLat: number | null;
    currentLng: number | null;
  }): Promise<{
    scope: PoolScope;
    stores: Array<{ store: Store; distanceMeters: number | null }>;
  }> {
    if (rider.storeId) {
      const store = await storeRepository.findActiveById(rider.storeId);
      return store
        ? { scope: 'store', stores: [{ store, distanceMeters: null }] }
        : { scope: 'unavailable', stores: [] };
    }

    if (rider.currentLat === null || rider.currentLng === null) {
      return { scope: 'unavailable', stores: [] };
    }

    const all = await storeRepository.listActive();
    const near = all
      .map((store) => ({
        store,
        distanceMeters: haversineMeters(
          rider.currentLat as number,
          rider.currentLng as number,
          store.latitude,
          store.longitude,
        ),
      }))
      .filter((s) => s.distanceMeters <= RIDER_PICKUP_RADIUS_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return { scope: 'proximity', stores: near };
  },

  /**
   * The rider's home payload. Claimable orders are only offered when the rider
   * is online and has nothing in flight — a rider juggling two drops is how
   * fresh groceries get cold — and only from stores they're eligible for.
   */
  async queue(riderUserId: string): Promise<RiderQueueView> {
    const rider = await riderRepository.findByUserId(riderUserId);
    const activeRows = await deliveryRepository.listActiveByRider(riderUserId);
    const active = await Promise.all(activeRows.map((a) => this.buildAssignmentView(a)));

    const empty = { active, available: [], scope: 'unavailable' as PoolScope, stores: [] };
    if (!rider) return empty;

    const { scope, stores } = await this.eligibleStores(rider);
    const storeList = stores.map((s) => ({
      id: s.store.id,
      name: s.store.name,
      area: s.store.area,
      distanceMeters: s.distanceMeters,
    }));

    const canTakeWork =
      rider.availability === RiderAvailability.Available && activeRows.length === 0;
    if (!canTakeWork) return { active, available: [], scope, stores: storeList };

    const claimable = await deliveryRepository.listClaimableOrders(stores.map((s) => s.store.id));
    const available = await Promise.all(claimable.map((o) => this.buildOrderView(o)));
    return { active, available, scope, stores: storeList };
  },

  async listMine(riderUserId: string): Promise<DeliveryAssignmentView[]> {
    const rows = await deliveryRepository.listByRider(riderUserId);
    return Promise.all(rows.map((a) => this.buildAssignmentView(a)));
  },

  /**
   * Claim a packed order. The order must still be packed and unheld; the unique
   * index on `order_id` settles races between two riders tapping at once.
   */
  async claim(riderUserId: string, orderId: string): Promise<DeliveryAssignmentView> {
    const rider = await riderRepository.findByUserId(riderUserId);
    if (!rider) throw AppError.notFound('Rider profile not found');
    if (rider.availability !== RiderAvailability.Available) {
      throw AppError.invalidState('Go online before accepting orders');
    }

    const inFlight = await deliveryRepository.findActiveByRider(riderUserId);
    if (inFlight) throw AppError.invalidState('Finish your current delivery first');

    const order = await orderRepository.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');
    if (order.status !== OrderStatus.Packed) {
      throw AppError.invalidState('This order is not ready for pickup');
    }

    // Re-check the store scope here, not just when building the queue: the
    // queue is presentation, and a rider could POST any order id directly.
    const { stores } = await this.eligibleStores(rider);
    if (!stores.some((s) => s.store.id === order.storeId)) {
      throw AppError.forbidden('This order is from a store you do not collect from');
    }

    const assignment = await db.transaction(async (tx) => {
      const codAmount = order.paymentMethod === 'cod' ? order.total : null;
      const claimed = await deliveryRepository.claim(orderId, riderUserId, codAmount, tx);
      if (!claimed) throw AppError.conflict('Another rider just took this order');
      await riderRepository.setAvailability(rider.id, RiderAvailability.Busy, tx);
      return claimed;
    });

    emitDelivery(assignment, order.userId);
    emitToUser(order.userId, RealtimeEvents.OrderAssigned, {
      orderId: order.id,
      at: new Date().toISOString(),
    });
    logger.info({ orderId, riderUserId }, 'Delivery claimed');
    return this.buildAssignmentView(assignment);
  },

  /**
   * Advance an assignment. Validated against `DELIVERY_STATUS_FLOW`, and where
   * a delivery state implies an order state, the order is moved through
   * `orderService.updateStatus` so inventory finalisation, COD capture and the
   * customer's timeline all stay in one place.
   */
  async advance(
    riderUserId: string,
    assignmentId: string,
    input: AdvanceDeliveryInput,
  ): Promise<DeliveryAssignmentView> {
    const assignment = await deliveryRepository.findById(assignmentId);
    if (!assignment) throw AppError.notFound('Assignment not found');
    if (assignment.riderId !== riderUserId) throw AppError.forbidden();

    const allowed = DELIVERY_STATUS_FLOW[assignment.status];
    if (!allowed.includes(input.status)) {
      throw AppError.invalidState(
        `Cannot move delivery from "${assignment.status}" to "${input.status}"`,
      );
    }

    if (input.status === DeliveryStatus.Completed) {
      await this.assertCodSettled(assignment);
    }

    const patch: Partial<DeliveryAssignment> = { status: input.status };
    if (input.status === DeliveryStatus.PickedUp) patch.pickedUpAt = new Date();
    if (input.status === DeliveryStatus.Completed) patch.deliveredAt = new Date();

    const updated = await deliveryRepository.update(assignmentId, patch);
    if (!updated) throw AppError.internal('Failed to update assignment');

    // Mirror the change onto the order where one is implied.
    const orderStatus = ORDER_STATUS_FOR[input.status];
    if (orderStatus) {
      await orderService.updateStatus(
        assignment.orderId,
        { status: orderStatus, note: input.note ?? `Rider marked ${input.status}` },
        riderUserId,
      );
    }

    // Freeing the rider: terminal states release them back to the pool.
    const rider = await riderRepository.findByUserId(riderUserId);
    if (rider) {
      const stillBusy = BUSY_STATUSES.includes(updated.status);
      await riderRepository.setAvailability(
        rider.id,
        stillBusy ? RiderAvailability.Busy : RiderAvailability.Available,
      );
    }

    const order = await orderRepository.findById(assignment.orderId);
    if (order) emitDelivery(updated, order.userId);
    logger.info({ assignmentId, status: updated.status, riderUserId }, 'Delivery status advanced');
    return this.buildAssignmentView(updated);
  },

  /** Record cash taken at the door. Only meaningful for COD orders. */
  async collectCod(riderUserId: string, assignmentId: string): Promise<DeliveryAssignmentView> {
    const assignment = await deliveryRepository.findById(assignmentId);
    if (!assignment) throw AppError.notFound('Assignment not found');
    if (assignment.riderId !== riderUserId) throw AppError.forbidden();
    if (assignment.codAmount === null) {
      throw AppError.invalidState('This order was paid online — there is no cash to collect');
    }
    if (assignment.codCollected) return this.buildAssignmentView(assignment);

    const updated = await deliveryRepository.update(assignmentId, { codCollected: true });
    if (!updated) throw AppError.internal('Failed to record COD collection');
    logger.info({ assignmentId, amount: assignment.codAmount }, 'COD collected');
    return this.buildAssignmentView(updated);
  },

  /** A COD order cannot be closed until the rider has actually taken the cash. */
  async assertCodSettled(assignment: DeliveryAssignment): Promise<void> {
    if (assignment.codAmount !== null && !assignment.codCollected) {
      throw AppError.invalidState('Collect the cash before completing this delivery');
    }
  },
};
