import { randomBytes } from 'node:crypto';
import {
  ORDER_STATUS_FLOW,
  OrderStatus,
  PaymentStatus,
  deliveryFeeFor,
  type OrderStatus as OrderStatusT,
  type OrderView,
  type OrderSummaryView,
  type PlaceOrderInput,
  type PlaceOrderResult,
  type UpdateOrderStatusInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { db } from '../../db/client';
import type { Order } from '../../db/schema';
import { addressRepository } from '../addresses/address.repository';
import { cartRepository } from '../cart/cart.repository';
import { deliveryRepository } from '../delivery/delivery.repository';
import { riderService } from '../riders/rider.service';
import { availableToSell, inventoryRepository } from '../inventory/inventory.repository';
import { paymentRepository } from '../payments/payment.repository';
import { paymentService } from '../payments/payment.service';
import { storeRepository } from '../stores/store.repository';
import { userRepository } from '../users/user.repository';
import { emitToOrder, emitToUser } from '../../realtime/gateway';
import { RealtimeEvents } from '../../realtime/events';
import { promotionService } from '../promotions/promotion.service';
import { orderRepository } from './order.repository';

const CANCELLABLE: ReadonlySet<OrderStatusT> = new Set([
  OrderStatus.Placed,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.Packed,
]);

const generateOrderNumber = (): string =>
  `HAALA-${randomBytes(4).readUInt32BE(0).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;

const emitStatus = (order: Pick<Order, 'id' | 'userId' | 'status'>): void => {
  const payload = { orderId: order.id, status: order.status, at: new Date().toISOString() };
  emitToUser(order.userId, RealtimeEvents.OrderStatusUpdated, payload);
  emitToOrder(order.id, RealtimeEvents.OrderStatusUpdated, payload);
};

export const orderService = {
  /**
   * Place an order from the user's cart. Everything that must be consistent —
   * stock reservation, order + items, status history, pending payment, cart
   * clearing — runs in a single transaction and rolls back together on any
   * failure (e.g. out of stock). Idempotent on the Idempotency-Key header.
   */
  async placeOrder(
    userId: string,
    input: PlaceOrderInput,
    idempotencyKey?: string,
  ): Promise<PlaceOrderResult> {
    if (idempotencyKey) {
      const existing = await orderRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.userId !== userId) throw AppError.forbidden();
        return { order: await this.buildView(existing), checkout: null };
      }
    }

    const cart = await cartRepository.getByUser(userId);
    if (!cart?.storeId) throw AppError.badRequest('Your cart is empty');
    const lines = await cartRepository.items(cart.id);
    if (lines.length === 0) throw AppError.badRequest('Your cart is empty');

    const address = await addressRepository.findByIdForUser(input.addressId, userId);
    if (!address) throw AppError.notFound('Delivery address not found');

    const storeId = cart.storeId;
    const store = await storeRepository.findActiveById(storeId);
    if (!store) throw AppError.invalidState('Store is not currently available');

    const user = await userRepository.findById(userId);
    if (!user) throw AppError.unauthorized();

    const productIds = lines.map((l) => l.productId);

    const { order, checkout } = await db.transaction(async (tx) => {
      // Lock the inventory rows so concurrent checkouts can't oversell.
      const invRows = await inventoryRepository.lockForStore(storeId, productIds, tx);
      const invByProduct = new Map(invRows.map((r) => [r.productId, r]));

      for (const line of lines) {
        const inv = invByProduct.get(line.productId);
        if (!inv || availableToSell(inv) < line.quantity) {
          throw AppError.outOfStock(`"${line.product.name}" is out of stock`);
        }
      }
      for (const line of lines) {
        await inventoryRepository.reserve(storeId, line.productId, line.quantity, tx);
      }

      const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const baseDeliveryFee = deliveryFeeFor(subtotal);

      // Re-price the promo here, inside the transaction and holding a row lock,
      // rather than trusting whatever the cart previewed. `lock: true` is what
      // stops two simultaneous checkouts both consuming the last use of a
      // limited code — the same reasoning as locking the inventory rows above.
      const promo = input.promoCode
        ? await promotionService.quote(userId, input.promoCode, subtotal, baseDeliveryFee, {
            lock: true,
            ex: tx,
          })
        : null;

      const deliveryFee = promo?.deliveryFee ?? baseDeliveryFee;
      const discount = promo?.discount ?? 0;
      const total = subtotal + deliveryFee - discount;

      const created = await orderRepository.create(
        {
          orderNumber: generateOrderNumber(),
          userId,
          storeId,
          status: OrderStatus.Placed,
          paymentMethod: input.paymentMethod,
          subtotal,
          deliveryFee,
          discount,
          total,
          promoCode: promo?.code ?? null,
          deliveryAddress: {
            label: address.label,
            line1: address.line1,
            line2: address.line2,
            area: address.area,
            city: address.city,
            latitude: address.latitude,
            longitude: address.longitude,
            notes: address.notes,
          },
          notes: input.notes ?? null,
          idempotencyKey: idempotencyKey ?? null,
        },
        tx,
      );

      await orderRepository.addItems(
        lines.map((l) => ({
          orderId: created.id,
          productId: l.productId,
          name: l.product.name,
          unit: l.product.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.quantity,
        })),
        tx,
      );

      await orderRepository.addStatusHistory(
        {
          orderId: created.id,
          status: OrderStatus.Placed,
          note: 'Order placed',
          createdBy: userId,
        },
        tx,
      );

      // The redemption row is what makes per-user limits enforceable, so it has
      // to commit with the order — an order without one is a discount the
      // customer can claim again.
      if (promo) await promotionService.redeem(promo, userId, created.id, tx);

      const payment = await paymentService.initiate(
        {
          orderId: created.id,
          method: input.paymentMethod,
          amount: total,
          idempotencyKey: `pay_${created.id}`,
          customer: { id: user.id, name: user.name, phone: user.phone, email: user.email },
        },
        tx,
      );

      await cartRepository.clear(cart.id, tx);
      await cartRepository.setStore(cart.id, null, tx);

      return { order: created, checkout: payment.checkout };
    });

    emitStatus(order);
    logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'Order placed');
    return { order: await this.buildView(order), checkout };
  },

  async listMine(userId: string): Promise<OrderSummaryView[]> {
    const rows = await orderRepository.listByUser(userId);
    const counts = await orderRepository.unitCounts(rows.map((r) => r.id));
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      itemCount: counts.get(o.id) ?? 0,
      createdAt: o.createdAt.toISOString(),
    }));
  },

  async getMine(userId: string, orderId: string): Promise<OrderView> {
    const order = await orderRepository.findByIdForUser(orderId, userId);
    if (!order) throw AppError.notFound('Order not found');
    return this.buildView(order);
  },

  /** Customer-initiated cancellation (pre-fulfilment). Releases stock, refunds if paid. */
  async cancel(userId: string, orderId: string): Promise<OrderView> {
    const order = await orderRepository.findByIdForUser(orderId, userId);
    if (!order) throw AppError.notFound('Order not found');
    if (!CANCELLABLE.has(order.status)) {
      throw AppError.invalidState('This order can no longer be cancelled');
    }

    await db.transaction(async (tx) => {
      const items = await orderRepository.items(orderId, tx);
      for (const it of items) {
        await inventoryRepository.release(order.storeId, it.productId, it.quantity, tx);
      }
      await promotionService.releaseForOrder(orderId, tx);
      await orderRepository.updateStatus(orderId, OrderStatus.Cancelled, {}, tx);
      await orderRepository.addStatusHistory(
        {
          orderId,
          status: OrderStatus.Cancelled,
          note: 'Cancelled by customer',
          createdBy: userId,
        },
        tx,
      );
    });

    // Refund any captured payment (COD pending → nothing to do).
    const payment = await paymentRepository.findByOrderId(orderId);
    if (payment?.status === PaymentStatus.Paid) {
      await paymentService.refund(orderId, order.total, 'Order cancelled');
    }

    const updated = (await orderRepository.findById(orderId)) as Order;
    emitStatus(updated);
    return this.buildView(updated);
  },

  /**
   * Ops/admin status transition. Validates against ORDER_STATUS_FLOW and, on
   * terminal states, reconciles inventory (finalize on delivered, release on
   * cancelled) and marks COD collected on delivery.
   */
  async updateStatus(
    orderId: string,
    input: UpdateOrderStatusInput,
    actorUserId: string,
  ): Promise<OrderView> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');

    const allowed = ORDER_STATUS_FLOW[order.status];
    if (!allowed.includes(input.status)) {
      throw AppError.invalidState(`Cannot move order from "${order.status}" to "${input.status}"`);
    }

    await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (input.status === OrderStatus.Delivered) {
        patch.deliveredAt = new Date();
        const items = await orderRepository.items(orderId, tx);
        for (const it of items) {
          await inventoryRepository.finalize(order.storeId, it.productId, it.quantity, tx);
        }
      }
      if (input.status === OrderStatus.Cancelled) {
        const items = await orderRepository.items(orderId, tx);
        for (const it of items) {
          await inventoryRepository.release(order.storeId, it.productId, it.quantity, tx);
        }
        // Hand the promo back too, or a cancelled order permanently burns the
        // customer's one-per-person launch offer.
        await promotionService.releaseForOrder(orderId, tx);
      }
      await orderRepository.updateStatus(orderId, input.status, patch, tx);
      await orderRepository.addStatusHistory(
        { orderId, status: input.status, note: input.note ?? null, createdBy: actorUserId },
        tx,
      );
    });

    if (input.status === OrderStatus.Delivered) {
      await paymentService.markCodCollected(orderId);
    }

    const updated = (await orderRepository.findById(orderId)) as Order;
    emitStatus(updated);
    return this.buildView(updated);
  },

  /** Full detail for any order — ops is not scoped to a single customer. */
  async getForOps(orderId: string): Promise<OrderView> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');
    return this.buildView(order);
  },

  /** Ops view of the pipeline — every customer's orders, not just one's. */
  async listForOps(status?: OrderStatusT): Promise<OrderSummaryView[]> {
    const rows = await orderRepository.listAll(status);
    const counts = await orderRepository.unitCounts(rows.map((r) => r.id));
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      itemCount: counts.get(o.id) ?? 0,
      createdAt: o.createdAt.toISOString(),
    }));
  },

  /**
   * Walk an order forward to `packed`, which is the point it becomes visible
   * to riders. Steps through each intermediate status rather than jumping, so
   * the transition guard and the customer's timeline both stay truthful.
   */
  async advanceToPacked(orderId: string, actorUserId: string): Promise<OrderView> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');

    const path: UpdateOrderStatusInput['status'][] = [
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.Packed,
    ];
    const from = path.indexOf(order.status as UpdateOrderStatusInput['status']);
    if (order.status === OrderStatus.Packed) return this.buildView(order);
    if (order.status !== OrderStatus.Placed && from === -1) {
      throw AppError.invalidState(`Cannot pack an order that is "${order.status}"`);
    }

    let view: OrderView | null = null;
    for (const status of path.slice(from + 1)) {
      view = await this.updateStatus(
        orderId,
        { status, note: 'Store preparing order' },
        actorUserId,
      );
    }
    return view ?? this.buildView(order);
  },

  async buildView(order: Order): Promise<OrderView> {
    const [items, history, payment, rider, assignment] = await Promise.all([
      orderRepository.items(order.id),
      orderRepository.statusHistory(order.id),
      paymentRepository.findByOrderId(order.id),
      riderService.publicViewForOrder(order.id),
      deliveryRepository.findByOrderId(order.id),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      storeId: order.storeId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: payment?.status ?? null,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      promoCode: order.promoCode,
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
      items: items.map((it) => ({
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
      timeline: history.map((h) => ({
        status: h.status,
        note: h.note,
        at: h.createdAt.toISOString(),
      })),
      rider,
      deliveryStatus: assignment?.status ?? null,
      createdAt: order.createdAt.toISOString(),
      deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    };
  },
};
