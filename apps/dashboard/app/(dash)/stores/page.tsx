'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { OpsStoreView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Dark stores.
 *
 * A store's coordinates and delivery radius decide who can order from it, and
 * its identity decides which riders collect there — so this is closer to
 * infrastructure than content. Two guards follow from that: `code` is fixed
 * after creation (riders, orders and the seed all refer to stores by it), and
 * deactivating is offered instead of deleting, because orders reference stores
 * permanently.
 */
interface FormState {
  name: string;
  code: string;
  addressLine: string;
  area: string;
  city: string;
  latitude: string;
  longitude: string;
  deliveryRadiusMeters: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  code: '',
  addressLine: '',
  area: '',
  city: 'Lahore',
  latitude: '',
  longitude: '',
  deliveryRadiusMeters: '5000',
  isActive: true,
};

const toForm = (s: OpsStoreView): FormState => ({
  name: s.name,
  code: s.code,
  addressLine: s.addressLine,
  area: s.area,
  city: s.city,
  latitude: String(s.latitude),
  longitude: String(s.longitude),
  deliveryRadiusMeters: String(s.deliveryRadiusMeters),
  isActive: s.isActive,
});

export default function StoresPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<OpsStoreView | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<OpsStoreView[]>('/ops/stores'),
  });

  const reset = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
  };

  const onSaved = () => {
    setError(null);
    reset();
    qc.invalidateQueries({ queryKey: ['ops', 'stores'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Could not save the store');

  const payload = () => ({
    name: form.name.trim(),
    addressLine: form.addressLine.trim(),
    area: form.area.trim(),
    city: form.city.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    deliveryRadiusMeters: Number(form.deliveryRadiusMeters),
    isActive: form.isActive,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<OpsStoreView>('/ops/stores', { ...payload(), code: form.code.trim() }),
    onSuccess: onSaved,
    onError,
  });

  const update = useMutation({
    // `code` is intentionally absent — the API rejects it as unknown.
    mutationFn: () => api.patch<OpsStoreView>(`/ops/stores/${editing!.id}`, payload()),
    onSuccess: onSaved,
    onError,
  });

  const toggleActive = useMutation({
    mutationFn: (s: OpsStoreView) =>
      api.patch<OpsStoreView>(`/ops/stores/${s.id}`, { isActive: !s.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'stores'] }),
    onError,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    (editing ? update : create).mutate();
  };

  const coordsValid =
    Number.isFinite(Number(form.latitude)) &&
    Number.isFinite(Number(form.longitude)) &&
    form.latitude.trim() !== '' &&
    form.longitude.trim() !== '';
  const canSubmit =
    form.name.trim().length >= 2 &&
    form.addressLine.trim().length >= 3 &&
    form.area.trim().length >= 2 &&
    form.city.trim().length >= 2 &&
    coordsValid &&
    (editing !== null || /^[A-Z0-9-]{2,}$/.test(form.code.trim())) &&
    !create.isPending &&
    !update.isPending;

  const rows = stores.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stores</h1>
          <p>
            Coordinates and radius decide who can order; riders are assigned to a store to decide
            what they collect.
          </p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 24 }}>
        <form
          className="card"
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}
        >
          <h2>{editing ? `Edit ${editing.code}` : 'New store'}</h2>

          <div className="field">
            <label htmlFor="code">Code</label>
            <input
              id="code"
              value={form.code}
              disabled={editing !== null}
              placeholder="LHR-DHA5"
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {editing
                ? 'Codes can’t change — orders and riders reference them.'
                : 'Uppercase letters, numbers and dashes.'}
            </span>
          </div>

          <Field label="Name" id="name">
            <input
              id="name"
              value={form.name}
              placeholder="Haala — DHA Phase 5"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Address" id="addr">
            <input
              id="addr"
              value={form.addressLine}
              placeholder="Commercial Broadway"
              onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Area" id="area">
              <input
                id="area"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </Field>
            <Field label="City" id="city">
              <input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Latitude" id="lat">
              <input
                id="lat"
                value={form.latitude}
                placeholder="31.4697"
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </Field>
            <Field label="Longitude" id="lng">
              <input
                id="lng"
                value={form.longitude}
                placeholder="74.4111"
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Delivery radius (m)" id="radius">
            <input
              id="radius"
              value={form.deliveryRadiusMeters}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, deliveryRadiusMeters: e.target.value })}
            />
          </Field>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              style={{ width: 16, height: 16 }}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span>Accepting orders</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="submit" disabled={!canSubmit}>
              {create.isPending || update.isPending
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : 'Create store'}
            </button>
            {editing ? (
              <button className="btn ghost" type="button" onClick={reset}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Location</th>
                <th className="num">Radius</th>
                <th>State</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {stores.isLoading ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No stores yet — create the first one.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="muted">{s.code}</div>
                    </td>
                    <td>
                      <div>
                        {s.area}, {s.city}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                      </div>
                    </td>
                    <td className="num">{(s.deliveryRadiusMeters / 1000).toFixed(1)} km</td>
                    <td>
                      <span className={`badge ${s.isActive ? 'good' : 'neutral'}`}>
                        {s.isActive ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn ghost sm"
                          onClick={() => {
                            setEditing(s);
                            setForm(toForm(s));
                            setError(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(s)}
                        >
                          {s.isActive ? 'Pause' : 'Resume'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
