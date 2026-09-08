import { z } from 'zod';
import {
  OrderStatus,
  PaymentMethod,
  type DeliveryStatus,
  type PaymentStatus,
} from '../enums';
import { promoCodeSchema } from './promotions';
import type { RiderPublicView } from './riders';
import type { ProductView } from './catalog';

export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum([PaymentMethod.Cod, PaymentMethod.Online]),
  notes: z.string().max(240).optional(),
  /** Rider tip in paisa. Bounded — see MAX_TIP. */
  tipAmount: z.number().int().min(0).max(200_000).optional(),
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
  serviceFee: number;
  /** Rider tip, recorded at placement. */
  tipAmount: number;
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

/**
 * "Buy it again" — the home screen's Recommended row.
 *
 * The count comes back with the products because the row's own subtitle quotes
 * it ("From your last 4 orders across Haala"). Deriving it client-side would
 * mean fetching the whole order list to print one number.
 *
 * `items` is priced for the store in the request, not for the receipt. See
 * `orderService.recentlyOrdered`.
 */
export interface RecentlyOrderedView {
  items: ProductView[];
  /** Orders this customer has placed and not cancelled. */
  orderCount: number;
}

// Re-exported for client convenience.
export type { DeliveryStatus };
