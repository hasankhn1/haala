'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { OrderStatus, type OrderSummaryView, type OrderView } from '@haala/shared';
import { ApiError, api, money } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * The fulfilment pipeline.
 *
 * This is the screen the whole dashboard existed to provide: orders arrive at
 * `placed` and nothing moves them onward, so until an operator confirms and
 * packs them, riders have nothing to claim. "Pack" is the primary action
 * because `packed` is the exact threshold at which an order becomes visible to
 * riders.
 */
const PIPELINE: Array<{ status: OrderStatus; label: string }> = [
  { status: OrderStatus.Placed, label: 'New' },
  { status: OrderStatus.Confirmed, label: 'Confirmed' },
  { status: OrderStatus.Preparing, label: 'Preparing' },
  { status: OrderStatus.Packed, label: 'Ready for pickup' },
  { status: OrderStatus.PickedUp, label: 'With rider' },
  { status: OrderStatus.OutForDelivery, label: 'Out for delivery' },
  { status: OrderStatus.Delivered, label: 'Delivered' },
];

/** Statuses an operator can still act on. Terminal ones are read-only. */
const ACTIONABLE = new Set<string>([
  OrderStatus.Placed,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
]);

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
};

export default function OrdersPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['ops', 'orders'],
    queryFn: () => api.get<OrderSummaryView[]>('/ops/orders'),
    refetchInterval: 10_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ops', 'orders'] });
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const pack = useMutation({
    mutationFn: (id: string) => api.post<OrderView>(`/ops/orders/${id}/pack`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const advance = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      api.patch<OrderView>(`/ops/orders/${vars.id}/status`, { status: vars.status }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const rows = orders.data ?? [];
  const counts = PIPELINE.map((p) => ({
    ...p,
    count: rows.filter((o) => o.status === p.status).length,
  }));
  const visible = filter === 'all' ? rows : rows.filter((o) => o.status === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p>
            Orders only reach riders once they’re <strong>packed</strong>. Pack a new order to put
            it in the rider queue.
          </p>
        </div>
        <button className="btn ghost" onClick={() => orders.refetch()}>
          Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="stat-row">
        {counts.map((c) => (
          <button
            key={c.status}
            className="stat"
            style={{
              textAlign: 'left',
              border: filter === c.status ? '2px solid var(--onyx-900)' : '2px solid transparent',
            }}
            onClick={() => setFilter(filter === c.status ? 'all' : c.status)}
          >
            <div className="value">{c.count}</div>
            <div className="label">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <span className="muted">
          {visible.length} {visible.length === 1 ? 'order' : 'orders'}
          {filter !== 'all' ? ` · filtered by ${filter}` : ''}
        </span>
        {filter !== 'all' ? (
          <button className="btn ghost sm" onClick={() => setFilter('all')}>
            Clear filter
          </button>
        ) : null}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th className="num">Items</th>
              <th className="num">Total</th>
              <th>Placed</th>
              <th style={{ width: 220 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading ? (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No orders here.
                </td>
              </tr>
            ) : (
              visible.map((o) => {
                const busy =
                  (pack.isPending && pack.variables === o.id) ||
                  (advance.isPending && advance.variables?.id === o.id);
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/orders/${o.id}`} style={{ textDecoration: 'underline' }}>
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="num">{o.itemCount}</td>
                    <td className="num">{money(o.total)}</td>
                    <td className="muted">{fmtTime(o.createdAt)}</td>
                    <td>
                      {ACTIONABLE.has(o.status) ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn sm"
                            disabled={busy}
                            onClick={() => pack.mutate(o.id)}
                            title="Confirm, prepare and pack in one step"
                          >
                            {busy ? 'Working…' : 'Pack →'}
                          </button>
                          {o.status === OrderStatus.Placed ? (
                            <button
                              className="btn ghost sm"
                              disabled={busy}
                              onClick={() =>
                                advance.mutate({ id: o.id, status: OrderStatus.Cancelled })
                              }
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      ) : o.status === OrderStatus.Packed ? (
                        <span className="muted">Waiting for a rider</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
