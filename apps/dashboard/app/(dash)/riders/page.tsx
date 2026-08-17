'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { OpsStoreView, RiderView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Rider roster.
 *
 * The store assignment here is load-bearing, not cosmetic: it decides which
 * orders each rider is offered. A rider with no store falls back to matching
 * on proximity to their last known position, and one with neither sees nothing
 * at all — which is why unassigned riders are called out rather than left to
 * quietly wonder where their queue went.
 */
const fmtSeen = (iso: string | null): string => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

export default function RidersPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const riders = useQuery({
    queryKey: ['ops', 'riders'],
    queryFn: () => api.get<RiderView[]>('/ops/riders'),
    refetchInterval: 15_000,
  });
  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<OpsStoreView[]>('/ops/stores'),
  });

  const assign = useMutation({
    mutationFn: (vars: { userId: string; storeId: string | null }) =>
      api.patch<RiderView>(`/ops/riders/${vars.userId}/store`, { storeId: vars.storeId }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['ops', 'riders'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not update rider'),
  });

  const rows = riders.data ?? [];
  const online = rows.filter((r) => r.availability !== 'offline').length;
  const unassigned = rows.filter((r) => !r.storeId).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Riders</h1>
          <p>
            A rider’s store decides which orders they’re offered. Unassigned riders are matched by
            proximity, and see nothing if their location is unknown.
          </p>
        </div>
        <button className="btn ghost" onClick={() => riders.refetch()}>
          Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="stat-row">
        <div className="stat">
          <div className="value">{rows.length}</div>
          <div className="label">Riders</div>
        </div>
        <div className="stat">
          <div className="value">{online}</div>
          <div className="label">On shift</div>
        </div>
        <div className="stat">
          <div className="value">{rows.filter((r) => r.availability === 'busy').length}</div>
          <div className="label">Delivering</div>
        </div>
        <div className="stat">
          <div className="value">{unassigned}</div>
          <div className="label">No store</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rider</th>
              <th>Status</th>
              <th>Home store</th>
              <th>Vehicle</th>
              <th className="num">Deliveries</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {riders.isLoading ? (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No riders yet. Create one on the Staff page.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="muted">{r.phone}</div>
                  </td>
                  <td>
                    <StatusBadge status={r.availability} />
                  </td>
                  <td>
                    <select
                      value={r.storeId ?? ''}
                      disabled={assign.isPending}
                      onChange={(e) =>
                        assign.mutate({ userId: r.userId, storeId: e.target.value || null })
                      }
                    >
                      <option value="">— Unassigned —</option>
                      {(stores.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="muted">{r.vehicleType ?? '—'}</td>
                  <td className="num">{r.completedDeliveries}</td>
                  <td className="muted">{fmtSeen(r.lastSeenAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
