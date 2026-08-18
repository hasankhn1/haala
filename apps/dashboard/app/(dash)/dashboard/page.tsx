'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AnalyticsOverview } from '@haala/shared';
import { api, money } from '@/lib/api';

/**
 * Ops home.
 *
 * Ordered by what an operator can act on, not by what's impressive. The live
 * pipeline comes first because a stuck order is the only thing here that needs
 * a response right now; the two timing metrics come next because they're the
 * levers behind the 15-minute promise. GMV sits below them — it's the result of
 * getting those right, not something you can push on directly.
 */
const RANGES = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
] as const;

/** Seconds → "8m" / "1h 12m". Null renders as an em dash, never a misleading 0. */
const duration = (secs: number | null): string => {
  if (secs === null) return '—';
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

const STATUS_LABEL: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed — awaiting rider',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
};

export default function DashboardPage() {
  const [days, setDays] = useState<number>(7);

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const overview = useQuery({
    queryKey: ['ops', 'analytics', days],
    queryFn: () =>
      api.get<AnalyticsOverview>(`/analytics/overview?from=${encodeURIComponent(from)}`),
    refetchInterval: 60_000,
  });

  const d = overview.data;
  const pipelineTotal = (d?.pipeline ?? []).reduce((n, p) => n + p.count, 0);
  const maxProductUnits = Math.max(1, ...(d?.topProducts ?? []).map((p) => p.unitsSold));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            {d
              ? `${new Date(d.range.from).toLocaleDateString()} – ${new Date(d.range.to).toLocaleDateString()}`
              : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`btn ${days === r.days ? '' : 'ghost'} sm`}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {overview.isError ? <div className="error-banner">Could not load analytics.</div> : null}

      {/* Live pipeline — the only thing here that may need action right now. */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="metric-label">In flight right now</div>
        {pipelineTotal === 0 ? (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Nothing in the pipeline — every order is delivered or closed.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {(d?.pipeline ?? []).map((p) => (
              <div key={p.status} className="bar-row">
                <span>{STATUS_LABEL[p.status] ?? p.status}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(p.count / pipelineTotal) * 100}%` }}
                  />
                </span>
                <span className="bar-value">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="metric-grid">
        <Metric
          label="Time to pack"
          value={duration(d?.timings.avgTimeToPackSeconds ?? null)}
          sub="Placed → packed (store)"
        />
        <Metric
          label="Wait for rider"
          value={duration(d?.timings.avgTimeToClaimSeconds ?? null)}
          sub="Packed → picked up"
        />
        <Metric
          label="Total delivery time"
          value={duration(d?.timings.avgDeliverySeconds ?? null)}
          sub="Placed → delivered"
        />
        <Metric
          label="Cancellation rate"
          value={d ? percent(d.totals.cancellationRate) : '—'}
          sub={d ? `${d.totals.cancelledOrders} of ${d.totals.orders} orders` : ''}
        />
      </div>

      <div className="metric-grid">
        <Metric label="Orders" value={d ? String(d.totals.orders) : '—'} sub="Placed in range" />
        <Metric
          label="Delivered"
          value={d ? String(d.totals.deliveredOrders) : '—'}
          sub="Completed orders"
        />
        <Metric
          label="GMV"
          value={d ? money(d.totals.grossMerchandiseValue) : '—'}
          sub="Delivered orders only"
        />
        <Metric
          label="Average order"
          value={d ? money(d.totals.averageOrderValue) : '—'}
          sub="GMV ÷ delivered"
        />
        <Metric
          label="Discount given"
          value={d ? money(d.totals.discountGiven) : '—'}
          sub="Across all orders"
        />
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="metric-label">Top products</div>
          {(d?.topProducts ?? []).length === 0 ? (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              No sales in this range.
            </p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {(d?.topProducts ?? []).map((p) => (
                <div key={p.productId} className="bar-row">
                  <span className="ellipsis" title={p.name}>
                    {p.name}
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${(p.unitsSold / maxProductUnits) * 100}%` }}
                    />
                  </span>
                  <span className="bar-value">{p.unitsSold}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="metric-label">Riders</div>
          {(d?.riders ?? []).length === 0 ? (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              No completed deliveries in this range.
            </p>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Rider</th>
                  <th className="num">Deliveries</th>
                  <th className="num">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {(d?.riders ?? []).map((r) => (
                  <tr key={r.riderUserId}>
                    <td>{r.name}</td>
                    <td className="num">{r.deliveries}</td>
                    <td className="num">{duration(r.avgDeliverySeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="metric-label">Stores</div>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Store</th>
                <th className="num">Orders</th>
                <th className="num">GMV</th>
              </tr>
            </thead>
            <tbody>
              {(d?.stores ?? []).map((s) => (
                <tr key={s.storeId}>
                  <td>
                    <div>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.code}
                    </div>
                  </td>
                  <td className="num">{s.orders}</td>
                  <td className="num">{money(s.grossMerchandiseValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="metric-label">Promo codes</div>
          {(d?.promotions ?? []).length === 0 ? (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              No codes redeemed in this range.
            </p>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="num">Redeemed</th>
                  <th className="num">Given away</th>
                </tr>
              </thead>
              <tbody>
                {(d?.promotions ?? []).map((p) => (
                  <tr key={p.code}>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{p.code}</td>
                    <td className="num">{p.redemptions}</td>
                    <td className="num">{money(p.discountGiven)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}
