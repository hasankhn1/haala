import { z } from 'zod';
import { DeliveryStatus, type PaymentMethod } from '../enums';
import type { PoolScope } from './riders';

/**
 * Valid forward transitions for a delivery assignment — enforced in the
 * Delivery service, mirroring how `ORDER_STATUS_FLOW` guards orders.
 *
 * The happy path is:
 *   pending → accepted → en_route_to_store → at_store → picked_up
 *           → en_route_to_customer → arrived → completed
 *
 * A rider may bail out to `cancelled` any time before the goods are picked up;
 * after pickup the order is the rider's responsibility and only ops can unwind
 * it, so `cancelled` is no longer offered.
 */
export const DELIVERY_STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['en_route_to_store', 'cancelled'],
  en_route_to_store: ['at_store', 'cancelled'],
  at_store: ['picked_up', 'cancelled'],
  picked_up: ['en_route_to_customer'],
  en_route_to_customer: ['arrived'],
  arrived: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Statuses a rider can drive directly (everything except the terminal ones). */
export const advanceDeliverySchema = z.object({
  status: z.enum([
    DeliveryStatus.Accepted,
    DeliveryStatus.Rejected,
    DeliveryStatus.EnRouteToStore,
    DeliveryStatus.AtStore,
    DeliveryStatus.PickedUp,
    DeliveryStatus.EnRouteToCustomer,
    DeliveryStatus.Arrived,
    DeliveryStatus.Completed,
    DeliveryStatus.Cancelled,
  ]),
  note: z.string().max(240).optional(),
});
export type AdvanceDeliveryInput = z.infer<typeof advanceDeliverySchema>;

export const claimOrderSchema = z.object({
  orderId: z.string().uuid(),
});
export type ClaimOrderInput = z.infer<typeof claimOrderSchema>;

export interface DeliveryStop {
  label: string;
  line1: string;
  line2?: string | null;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export interface DeliveryItemView {
  name: string;
  unit: string;
  quantity: number;
}

/** Everything a rider needs on screen to run one delivery. */
export interface DeliveryOrderView {
  id: string;
  orderNumber: string;
  total: number; // paisa
  paymentMethod: PaymentMethod;
  itemCount: number;
  items: DeliveryItemView[];
  customerName: string;
  customerPhone: string;
  dropoff: DeliveryStop;
  pickup: {
    storeId: string;
    name: string;
    area: string;
    city: string;
    latitude: number;
    longitude: number;
  } | null;
}

export interface DeliveryAssignmentView {
  id: string;
  status: DeliveryStatus;
  /** COD to collect in paisa; null for prepaid orders. */
  codAmount: number | null;
  codCollected: boolean;
  assignedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  order: DeliveryOrderView;
}

/**
 * The rider's home payload: what they're currently on, plus what they could
 * pick up next. `available` is only populated when the rider is online.
 *
 * `scope` explains *why* the available list looks the way it does — an empty
 * queue because you're unassigned and un-located is a very different problem
 * from an empty queue because nothing is packed yet, and the rider needs to be
 * able to tell them apart.
 */
export interface RiderQueueView {
  active: DeliveryAssignmentView[];
  available: DeliveryOrderView[];
  scope: PoolScope;
  /** Stores the rider is currently eligible to collect from. */
  stores: Array<{ id: string; name: string; area: string; distanceMeters: number | null }>;
}
