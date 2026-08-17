import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { DeliveryStatus, OrderStatus, type DeliveryStatus as DeliveryStatusT } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import {
  deliveryAssignments,
  orders,
  type DeliveryAssignment,
  type NewDeliveryAssignment,
  type Order,
} from '../../db/schema';

/** Assignment states where the rider still owes work on the order. */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatusT[] = [
  DeliveryStatus.Pending,
  DeliveryStatus.Accepted,
  DeliveryStatus.EnRouteToStore,
  DeliveryStatus.AtStore,
  DeliveryStatus.PickedUp,
  DeliveryStatus.EnRouteToCustomer,
  DeliveryStatus.Arrived,
];

/** Assignment states that no longer hold the order (it can be re-offered). */
const RELEASED_STATUSES: DeliveryStatusT[] = [DeliveryStatus.Rejected, DeliveryStatus.Cancelled];

/**
 * Is the rider physically holding this customer's goods right now?
 *
 * This is the **single gate on exposing a rider's position to a customer**.
 * Before pickup the rider may be anywhere — at home, on another errand — and
 * their coordinates tell the customer nothing about their order while
 * disclosing the rider's movements. After delivery there is nothing left to
 * track.
 *
 * It lives here, shared, because it was previously written out twice — once on
 * the REST view and once on the socket emit — and the two drifted: the REST
 * path withheld pre-pickup coordinates while the socket broadcast them. Any new
 * surface that exposes rider location must call this rather than re-derive it.
 */
export const isCarryingForCustomer = (assignment: {
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
}): boolean => assignment.pickedUpAt !== null && assignment.deliveredAt === null;

export const deliveryRepository = {
  async create(data: NewDeliveryAssignment, ex: Executor = db): Promise<DeliveryAssignment> {
    const [row] = await ex.insert(deliveryAssignments).values(data).returning();
    return row as DeliveryAssignment;
  },

  async findById(id: string, ex: Executor = db): Promise<DeliveryAssignment | undefined> {
    const [row] = await ex
      .select()
      .from(deliveryAssignments)
      .where(eq(deliveryAssignments.id, id))
      .limit(1);
    return row;
  },

  async findByOrderId(orderId: string, ex: Executor = db): Promise<DeliveryAssignment | undefined> {
    const [row] = await ex
      .select()
      .from(deliveryAssignments)
      .where(eq(deliveryAssignments.orderId, orderId))
      .limit(1);
    return row;
  },

  /** Every assignment for a rider, newest first. */
  async listByRider(riderUserId: string, ex: Executor = db): Promise<DeliveryAssignment[]> {
    return ex
      .select()
      .from(deliveryAssignments)
      .where(eq(deliveryAssignments.riderId, riderUserId))
      .orderBy(desc(deliveryAssignments.assignedAt));
  },

  /** Assignments the rider is still working — what the queue screen shows. */
  async listActiveByRider(riderUserId: string, ex: Executor = db): Promise<DeliveryAssignment[]> {
    return ex
      .select()
      .from(deliveryAssignments)
      .where(
        and(
          eq(deliveryAssignments.riderId, riderUserId),
          inArray(deliveryAssignments.status, ACTIVE_DELIVERY_STATUSES),
        ),
      )
      .orderBy(desc(deliveryAssignments.assignedAt));
  },

  /** The single in-flight assignment, used to route live location updates. */
  async findActiveByRider(
    riderUserId: string,
    ex: Executor = db,
  ): Promise<DeliveryAssignment | undefined> {
    const [row] = await this.listActiveByRider(riderUserId, ex);
    return row;
  },

  async update(
    id: string,
    data: Partial<NewDeliveryAssignment>,
    ex: Executor = db,
  ): Promise<DeliveryAssignment | undefined> {
    const [row] = await ex
      .update(deliveryAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deliveryAssignments.id, id))
      .returning();
    return row;
  },

  /**
   * Orders that are packed and ready but not currently held by any rider.
   *
   * "Not held" means there is no assignment row, or the only one is
   * rejected/cancelled — so an order a rider walks away from returns to the
   * pool rather than being stranded.
   */
  async listClaimableOrders(storeIds: string[], ex: Executor = db): Promise<Order[]> {
    // No eligible store means no claimable work — never fall through to every
    // store, or a rider in Lahore is offered a pickup in Karachi.
    if (storeIds.length === 0) return [];

    const held = ex
      .select({ orderId: deliveryAssignments.orderId })
      .from(deliveryAssignments)
      .where(notInArray(deliveryAssignments.status, RELEASED_STATUSES));

    return ex
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, OrderStatus.Packed),
          inArray(orders.storeId, storeIds),
          notInArray(orders.id, held),
        ),
      )
      .orderBy(orders.createdAt);
  },

  /**
   * Claim an order for a rider, atomically.
   *
   * The unique index on `order_id` is what actually prevents two riders taking
   * the same order: the loser's insert violates it and we surface a conflict.
   * A previously rejected/cancelled row is reused rather than inserted over.
   */
  async claim(
    orderId: string,
    riderUserId: string,
    codAmount: number | null,
    ex: Executor = db,
  ): Promise<DeliveryAssignment | undefined> {
    const existing = await this.findByOrderId(orderId, ex);
    if (existing) {
      if (!RELEASED_STATUSES.includes(existing.status)) return undefined;
      return this.update(
        existing.id,
        {
          riderId: riderUserId,
          status: DeliveryStatus.Accepted,
          codAmount,
          codCollected: false,
          assignedAt: new Date(),
          acceptedAt: new Date(),
          pickedUpAt: null,
          deliveredAt: null,
        },
        ex,
      );
    }
    return this.create(
      {
        orderId,
        riderId: riderUserId,
        status: DeliveryStatus.Accepted,
        codAmount,
        acceptedAt: new Date(),
      },
      ex,
    );
  },
};
