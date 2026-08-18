import { z } from 'zod';
import {
  OrderStatus,
  PaymentMethod,
  type DeliveryStatus,
  type PaymentStatus,
} from '../enums';
import { promoCodeSchema } from './promotions';
import type { RiderPublicView } from './riders';

export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum([PaymentMethod.Cod, PaymentMethod.Online]),
  notes: z.string().max(240).optional(),
  /**
   * Optional promo code. Re-priced server-side at placement — the cart's quote
   * is a preview, never the charge.
   */
  promoCode: promoCodeSchema.optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    OrderStatus.Confirmed,
    OrderStatus.Preparing,
    OrderStatus.Packed,
    OrderStatus.PickedUp,
    OrderStatus.OutForDelivery,
    OrderStatus.Delivered,
    OrderStatus.Cancelled,
    OrderStatus.Failed,
  ]),
  note: z.string().max(240).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export interface OrderItemView {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number; // paisa
  lineTotal: number; // paisa
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  note: string | null;
  at: string; // ISO
}

export interface OrderAddress {
  label: string;
  line1: string;
  line2?: string | null;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  storeId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  /** The promo code applied at order time, if any. */
  promoCode: string | null;
  deliveryAddress: OrderAddress;
  notes: string | null;
  items: OrderItemView[];
  timeline: OrderTimelineEntry[];
  /**
   * The courier, once one has taken the order. Null before assignment and for
   * orders that never reach dispatch. Their live position only appears after
   * pickup — see the Riders service.
   */
  rider: RiderPublicView | null;
  /** Delivery-side status, when an assignment exists. */
  deliveryStatus: DeliveryStatus | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  createdAt: string;
}

/** Result of placing an order — includes online checkout handoff when relevant. */
export interface PlaceOrderResult {
  order: OrderView;
  checkout: { url?: string; token?: string } | null;
}

// Re-exported for client convenience.
export type { DeliveryStatus };
