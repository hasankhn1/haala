import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import type {
  AnalyticsRiderRow,
  AnalyticsStatusCount,
  AnalyticsStoreRow,
  AnalyticsTimings,
  AnalyticsTopProduct,
  AnalyticsTotals,
} from '@haala/shared';

/**
 * Analytics reads.
 *
 * Raw SQL rather than the query builder: these are aggregates with conditional
 * sums and timestamp diffs across joins, which the builder expresses far less
 * legibly than the SQL itself. Every query is parameterised — `storeId` is
 * interpolated through drizzle's `sql` tag, not string concatenation.
 *
 * Durations come back as seconds (`epoch` from an interval) and money as paisa,
 * matching the contract.
 */

interface Range {
  from: Date;
  to: Date;
  storeId?: string | undefined;
}

/** `AND store_id = $x` when a store filter is set, otherwise nothing. */
const storeFilter = (storeId?: string) =>
  storeId ? sql`AND o.store_id = ${storeId}` : sql``;

export const analyticsRepository = {
  async totals({ from, to, storeId }: Range): Promise<AnalyticsTotals> {
    const rows = await db.execute(sql`
      SELECT
        count(*)::int                                                        AS orders,
        count(*) FILTER (WHERE o.status = 'delivered')::int                  AS delivered_orders,
        count(*) FILTER (WHERE o.status = 'cancelled')::int                  AS cancelled_orders,
        coalesce(sum(o.total) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS gmv,
        coalesce(sum(o.discount), 0)::bigint                                 AS discount_given
      FROM orders o
      WHERE o.placed_at >= ${from} AND o.placed_at <= ${to}
      ${storeFilter(storeId)}
    `);

    const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
    const orders = Number(r.orders ?? 0);
    const deliveredOrders = Number(r.delivered_orders ?? 0);
    const cancelledOrders = Number(r.cancelled_orders ?? 0);
    const gmv = Number(r.gmv ?? 0);

    return {
      orders,
      deliveredOrders,
      cancelledOrders,
      grossMerchandiseValue: gmv,
      // Guarded: dividing by zero deliveries would produce NaN and poison JSON.
      averageOrderValue: deliveredOrders > 0 ? Math.round(gmv / deliveredOrders) : 0,
      cancellationRate: orders > 0 ? cancelledOrders / orders : 0,
      discountGiven: Number(r.discount_given ?? 0),
    };
  },

  /**
   * Average durations across the lifecycle.
   *
   * Pack and claim times read from `order_status_history` rather than the order
   * row, because the order only keeps its *current* status — the history is the
   * only record of when it passed through `packed`. `min(created_at)` per status
   * guards against an order that was moved back and forth.
   */
  async timings({ from, to, storeId }: Range): Promise<AnalyticsTimings> {
    const rows = await db.execute(sql`
      WITH marks AS (
        SELECT
          o.id,
          o.placed_at,
          o.delivered_at,
          min(h.created_at) FILTER (WHERE h.status = 'packed')    AS packed_at,
          min(h.created_at) FILTER (WHERE h.status = 'picked_up') AS picked_up_at
        FROM orders o
        LEFT JOIN order_status_history h ON h.order_id = o.id
        WHERE o.placed_at >= ${from} AND o.placed_at <= ${to}
        ${storeFilter(storeId)}
        GROUP BY o.id, o.placed_at, o.delivered_at
      )
      SELECT
        avg(extract(epoch FROM (delivered_at - placed_at)))  AS avg_delivery,
        avg(extract(epoch FROM (packed_at - placed_at)))     AS avg_to_pack,
        avg(extract(epoch FROM (picked_up_at - packed_at)))  AS avg_to_claim
      FROM marks
    `);

    const r = (rows.rows[0] ?? {}) as Record<string, unknown>;
    const secs = (v: unknown): number | null =>
      v === null || v === undefined ? null : Math.round(Number(v));

    return {
      avgDeliverySeconds: secs(r.avg_delivery),
      avgTimeToPackSeconds: secs(r.avg_to_pack),
      avgTimeToClaimSeconds: secs(r.avg_to_claim),
    };
  },

  /** Live pipeline. Deliberately ignores the date range — "now" is the point. */
  async pipeline(storeId?: string): Promise<AnalyticsStatusCount[]> {
    const rows = await db.execute(sql`
      SELECT o.status::text AS status, count(*)::int AS count
      FROM orders o
      WHERE o.status NOT IN ('delivered', 'cancelled', 'failed')
      ${storeFilter(storeId)}
      GROUP BY o.status
      ORDER BY count DESC
    `);
    return rows.rows.map((r) => ({
      status: String((r as Record<string, unknown>).status),
      count: Number((r as Record<string, unknown>).count),
    }));
  },

  async topProducts({ from, to, storeId }: Range, limit = 10): Promise<AnalyticsTopProduct[]> {
    const rows = await db.execute(sql`
      SELECT
        oi.product_id                    AS product_id,
        oi.name                          AS name,
        sum(oi.quantity)::int            AS units_sold,
        sum(oi.line_total)::bigint       AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.placed_at >= ${from} AND o.placed_at <= ${to}
        AND o.status <> 'cancelled'
      ${storeFilter(storeId)}
      GROUP BY oi.product_id, oi.name
      ORDER BY units_sold DESC
      LIMIT ${limit}
    `);
    return rows.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        productId: String(r.product_id),
        name: String(r.name),
        unitsSold: Number(r.units_sold),
        revenue: Number(r.revenue),
      };
    });
  },

  async byStore({ from, to }: Range): Promise<AnalyticsStoreRow[]> {
    const rows = await db.execute(sql`
      SELECT
        s.id                                                                   AS store_id,
        s.name                                                                 AS name,
        s.code                                                                 AS code,
        count(o.id)::int                                                       AS orders,
        coalesce(sum(o.total) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS gmv
      FROM stores s
      LEFT JOIN orders o
        ON o.store_id = s.id
       AND o.placed_at >= ${from}
       AND o.placed_at <= ${to}
      GROUP BY s.id, s.name, s.code
      ORDER BY orders DESC
    `);
    return rows.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        storeId: String(r.store_id),
        name: String(r.name),
        code: String(r.code),
        orders: Number(r.orders),
        grossMerchandiseValue: Number(r.gmv),
      };
    });
  },

  /**
   * Joins through `delivery_assignments` rather than `orders.rider_id`.
   *
   * The assignment is the authoritative record of who carried an order — it's
   * what the claim writes and what the whole delivery workflow reads. Going via
   * the denormalised column would also have silently excluded every order
   * placed before that column started being populated.
   */
  async byRider({ from, to, storeId }: Range): Promise<AnalyticsRiderRow[]> {
    const rows = await db.execute(sql`
      SELECT
        u.id                                                    AS rider_user_id,
        u.name                                                  AS name,
        count(o.id)::int                                        AS deliveries,
        avg(extract(epoch FROM (o.delivered_at - o.placed_at))) AS avg_delivery
      FROM orders o
      JOIN delivery_assignments da ON da.order_id = o.id
      JOIN users u ON u.id = da.rider_id
      WHERE o.status = 'delivered'
        AND o.placed_at >= ${from} AND o.placed_at <= ${to}
      ${storeFilter(storeId)}
      GROUP BY u.id, u.name
      ORDER BY deliveries DESC
    `);
    return rows.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        riderUserId: String(r.rider_user_id),
        name: String(r.name),
        deliveries: Number(r.deliveries),
        avgDeliverySeconds: r.avg_delivery === null ? null : Math.round(Number(r.avg_delivery)),
      };
    });
  },

  async promotionUsage({
    from,
    to,
  }: Range): Promise<Array<{ code: string; redemptions: number; discountGiven: number }>> {
    const rows = await db.execute(sql`
      SELECT
        p.code                              AS code,
        count(r.id)::int                    AS redemptions,
        coalesce(sum(r.discount), 0)::bigint AS discount_given
      FROM promotions p
      LEFT JOIN promotion_redemptions r
        ON r.promotion_id = p.id
       AND r.created_at >= ${from}
       AND r.created_at <= ${to}
      GROUP BY p.code
      HAVING count(r.id) > 0
      ORDER BY redemptions DESC
    `);
    return rows.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        code: String(r.code),
        redemptions: Number(r.redemptions),
        discountGiven: Number(r.discount_given),
      };
    });
  },
};
