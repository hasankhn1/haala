import { z } from 'zod';

/**
 * Ops analytics. Read-only, admin-only.
 *
 * The metric set is chosen for a quick-commerce pilot rather than a general
 * dashboard: alongside the obvious volume and money figures, it surfaces the
 * two timings an operator can actually act on — how long orders sit before
 * they're packed, and how long a packed order waits for a rider. Those are the
 * levers behind a 15-minute promise; GMV is the result, not the lever.
 *
 * All money is integer paisa; all durations are seconds.
 */
export const analyticsQuerySchema = z.object({
  /** ISO date-time. Defaults to 30 days ago. */
  from: z.string().datetime().optional(),
  /** ISO date-time. Defaults to now. */
  to: z.string().datetime().optional(),
  storeId: z.string().uuid().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface AnalyticsTotals {
  orders: number;
  /** Delivered orders only — an order that never arrived isn't revenue. */
  deliveredOrders: number;
  cancelledOrders: number;
  /** Sum of `total` across delivered orders, paisa. */
  grossMerchandiseValue: number;
  /** GMV / deliveredOrders, paisa. 0 when nothing has been delivered. */
  averageOrderValue: number;
  /** cancelledOrders / orders, 0–1. */
  cancellationRate: number;
  /** Discount given away across all orders in range, paisa. */
  discountGiven: number;
}

export interface AnalyticsTimings {
  /** Placement → delivered, seconds. Null when nothing has been delivered yet. */
  avgDeliverySeconds: number | null;
  /** Placement → packed: how long the store takes. The first lever. */
  avgTimeToPackSeconds: number | null;
  /** Packed → picked up: how long a packed order waits for a rider. The second. */
  avgTimeToClaimSeconds: number | null;
}

export interface AnalyticsStatusCount {
  status: string;
  count: number;
}

export interface AnalyticsTopProduct {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface AnalyticsStoreRow {
  storeId: string;
  name: string;
  code: string;
  orders: number;
  grossMerchandiseValue: number;
}

export interface AnalyticsRiderRow {
  riderUserId: string;
  name: string;
  deliveries: number;
  avgDeliverySeconds: number | null;
}

export interface AnalyticsOverview {
  /** Echoes the resolved window so the UI can label what it's showing. */
  range: { from: string; to: string };
  totals: AnalyticsTotals;
  timings: AnalyticsTimings;
  /** Live pipeline — counts by status, unfiltered by the date range. */
  pipeline: AnalyticsStatusCount[];
  topProducts: AnalyticsTopProduct[];
  stores: AnalyticsStoreRow[];
  riders: AnalyticsRiderRow[];
  /** Promo redemptions in range, for judging whether a launch offer is working. */
  promotions: Array<{ code: string; redemptions: number; discountGiven: number }>;
}
