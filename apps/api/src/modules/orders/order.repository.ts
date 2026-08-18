import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { OrderStatus } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import {
  orderItems,
  orderStatusHistory,
  orders,
  type NewOrder,
  type Order,
  type OrderItem,
  type OrderStatusHistoryRow,
} from '../../db/schema';

export const orderRepository = {
  async create(data: NewOrder, ex: Executor = db): Promise<Order> {
    const [row] = await ex.insert(orders).values(data).returning();
    return row as Order;
  },

  async addItems(items: (typeof orderItems.$inferInsert)[], ex: Executor = db): Promise<void> {
    if (items.length === 0) return;
    await ex.insert(orderItems).values(items);
  },

  async addStatusHistory(
    entry: typeof orderStatusHistory.$inferInsert,
    ex: Executor = db,
  ): Promise<void> {
    await ex.insert(orderStatusHistory).values(entry);
  },

  async findById(id: string, ex: Executor = db): Promise<Order | undefined> {
    const [row] = await ex.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row;
  },

  async findByIdForUser(id: string, userId: string, ex: Executor = db): Promise<Order | undefined> {
    const [row] = await ex
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);
    return row;
  },

  async findByIdempotencyKey(key: string, ex: Executor = db): Promise<Order | undefined> {
    const [row] = await ex.select().from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
    return row;
  },

  async listByUser(userId: string, ex: Executor = db): Promise<Order[]> {
    return ex
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  },

  /** All orders across customers — ops/dashboard only. */
  async listAll(status?: OrderStatus, ex: Executor = db): Promise<Order[]> {
    const q = ex.select().from(orders).orderBy(desc(orders.createdAt));
    return status ? q.where(eq(orders.status, status)) : q;
  },

  async items(orderId: string, ex: Executor = db): Promise<OrderItem[]> {
    return ex.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  },

  async statusHistory(orderId: string, ex: Executor = db): Promise<OrderStatusHistoryRow[]> {
    return ex
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt));
  },

  /** Total item units per order (for list summaries). */
  async unitCounts(orderIds: string[], ex: Executor = db): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    const rows = await ex
      .select({ orderId: orderItems.orderId, units: sql<number>`sum(${orderItems.quantity})` })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))
      .groupBy(orderItems.orderId);
    return new Map(rows.map((r) => [r.orderId, Number(r.units)]));
  },

  /** Denormalised copy of who is carrying the order; see `deliveryService.claim`. */
  async setRider(orderId: string, riderUserId: string, ex: Executor = db): Promise<void> {
    await ex
      .update(orders)
      .set({ riderId: riderUserId, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    patch: Partial<NewOrder> = {},
    ex: Executor = db,
  ): Promise<Order | undefined> {
    const [row] = await ex
      .update(orders)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return row;
  },
};
