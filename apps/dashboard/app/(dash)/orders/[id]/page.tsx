'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderStatus, type OrderView } from '@haala/shared';
import { ApiError, api, money } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * One order, in full.
 *
 * The list answers "what needs doing"; this answers "what actually happened" —
 * the line items a picker must assemble, where it's going, who's carrying it,
 * and the audit trail of every status change with timestamps.
 */
const ACTIONABLE = new Set<string>([
  OrderStatus.Placed,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
]);

const fmt = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(
    2,
    '0',
  )}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ['ops', 'order', id],
    queryFn: () => api.get<OrderView>(`/ops/orders/${id}`),
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ops', 'order', id] });
    qc.invalidateQueries({ queryKey: ['ops', 'orders'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const pack = useMutation({
    mutationFn: () => api.post<OrderView>(`/ops/orders/${id}/pack`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.patch<OrderView>(`/ops/orders/${id}/status`, { status: OrderStatus.Cancelled }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const o = order.data;

  if (order.isLoading) return <div className="empty">Loading…</div>;
  if (!o) {
    return (
      <div className="empty">
        <p>Order not found.</p>
        <button className="btn secondary" onClick={() => router.push('/orders')}>
          Back to orders
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/orders" className="muted">
            ← Orders
          </Link>
          <h1 style={{ marginTop: 6 }}>{o.orderNumber}</h1>
          <p>
            Placed {fmt(o.createdAt)} ·{' '}
            {o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'} · payment{' '}
            {o.paymentStatus ?? 'pending'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={o.status} />
          {ACTIONABLE.has(o.status) ? (
            <>
              <button className="btn" disabled={pack.isPending} onClick={() => pack.mutate()}>
                {pack.isPending ? 'Working…' : 'Pack →'}
              </button>
              <button
                className="btn ghost"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(280px, 360px)', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Picking list */}
          <div>
            <h2 style={{ marginBottom: 12 }}>Items</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((it) => (
                    <tr key={it.productId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{it.name}</div>
                        <div className="muted">{it.unit}</div>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {it.quantity}
                      </td>
                      <td className="num muted">{money(it.unitPrice)}</td>
                      <td className="num">{money(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit trail */}
          <div>
            <h2 style={{ marginBottom: 12 }}>Timeline</h2>
            <div className="card">
              {o.timeline.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No status changes recorded.
                </p>
              ) : (
                <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {o.timeline.map((t, i) => (
                    <li
                      key={`${t.status}-${t.at}`}
                      style={{
                        display: 'flex',
                        gap: 12,
                        paddingBottom: i === o.timeline.length - 1 ? 0 : 14,
                        borderLeft:
                          i === o.timeline.length - 1 ? 'none' : '2px solid var(--border)',
                        marginLeft: 5,
                        paddingLeft: 16,
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: -6,
                          top: 4,
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: 'var(--onyx-900)',
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <StatusBadge status={t.status} />
                        {t.note ? <div style={{ marginTop: 4 }}>{t.note}</div> : null}
                      </div>
                      <div className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {fmt(t.at)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* Side rail: money, destination, courier */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Bill</h2>
            <Row label="Subtotal" value={money(o.subtotal)} />
            <Row label="Delivery" value={o.deliveryFee === 0 ? 'Free' : money(o.deliveryFee)} />
            {o.discount > 0 ? <Row label="Discount" value={`− ${money(o.discount)}`} /> : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderTop: '1px solid var(--border)',
                marginTop: 10,
                paddingTop: 10,
              }}
            >
              <strong>Total</strong>
              <strong style={{ fontSize: 20 }}>{money(o.total)}</strong>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Deliver to</h2>
            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
              {o.deliveryAddress.label}
            </div>
            <div className="muted">
              {o.deliveryAddress.line1}
              {o.deliveryAddress.line2 ? `, ${o.deliveryAddress.line2}` : ''}
              <br />
              {o.deliveryAddress.area}, {o.deliveryAddress.city}
            </div>
            {o.deliveryAddress.notes ? (
              <div style={{ marginTop: 8 }}>
                <span className="badge neutral">Note</span> {o.deliveryAddress.notes}
              </div>
            ) : null}
            <a
              className="btn ghost sm"
              style={{ marginTop: 12, display: 'inline-block' }}
              href={`https://www.google.com/maps/search/?api=1&query=${o.deliveryAddress.latitude},${o.deliveryAddress.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Maps
            </a>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Courier</h2>
            {o.rider ? (
              <>
                <div style={{ fontWeight: 600 }}>{o.rider.name}</div>
                <div className="muted">{o.rider.phone}</div>
                <div style={{ marginTop: 8 }}>
                  {o.deliveryStatus ? <StatusBadge status={o.deliveryStatus} /> : null}
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  {o.rider.vehicleType ?? 'Vehicle not set'} · {o.rider.trips} completed
                  {o.rider.lat === null ? ' · location shared after pickup' : ''}
                </div>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No rider yet. Riders can claim this once it’s <strong>packed</strong>.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
