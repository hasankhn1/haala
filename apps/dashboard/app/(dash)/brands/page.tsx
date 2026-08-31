'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';
import type { BrandView, BrandsQuery, BusinessTypeView } from '@haala/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { ApiError, api } from '@/lib/api';

/**
 * Brands — the businesses selling on the platform.
 *
 * Creating one here does not give anybody a way in: a brand and its login are
 * separate steps, and the login is created on the brand's own page. That split
 * is deliberate, because handing out credentials is the moment worth being
 * sure about, and it should not be a side effect of typing a shop name.
 *
 * A brand is never deleted. Products, categories and eventually orders hang off
 * it, so `suspended` is the off switch — it keeps the catalogue and stops the
 * selling.
 */
interface FormState {
  name: string;
  businessTypeKey: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY: FormState = {
  name: '',
  businessTypeKey: '',
  description: '',
  contactPhone: '',
  contactEmail: '',
};

const FILTERS: Array<{ label: string; value: BrandsQuery['status'] | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Suspended', value: 'suspended' },
];

export default function BrandsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<BrandsQuery['status'] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['admin', 'business-types'],
    queryFn: () => api.get<BusinessTypeView[]>('/admin/business-types'),
  });

  const brands = useQuery({
    queryKey: ['admin', 'brands', status ?? 'all'],
    queryFn: () => api.get<BrandView[]>(`/admin/brands${status ? `?status=${status}` : ''}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<BrandView>('/admin/brands', {
        name: form.name.trim(),
        businessTypeKey: form.businessTypeKey,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
        ...(form.contactEmail.trim() ? { contactEmail: form.contactEmail.trim() } : {}),
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      qc.invalidateQueries({ queryKey: ['admin', 'brands'] });
      qc.invalidateQueries({ queryKey: ['admin', 'business-types'] });
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : 'Could not create the brand'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  // Only types that can actually take a brand: one whose registry entry has not
  // shipped would leave the vendor unable to save a single product.
  const usableTypes = (types.data ?? []).filter((t) => t.isActive && t.hasSpec);
  const canSubmit =
    form.name.trim().length >= 2 && form.businessTypeKey !== '' && !create.isPending;

  const rows = brands.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Brands</h1>
          <p>
            Every business selling on Haala. Each one owns its own catalogue and sees nothing of
            anyone else’s.
          </p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: 24 }}>
        <form
          className="card"
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}
        >
          <h2>New brand</h2>

          <Field label="Business name" id="name">
            <input
              id="name"
              value={form.name}
              placeholder="Sarah’s Bakery"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Business type" id="type">
            <select
              id="type"
              value={form.businessTypeKey}
              onChange={(e) => setForm({ ...form, businessTypeKey: e.target.value })}
            >
              <option value="">Choose a type…</option>
              {usableTypes.map((t) => (
                <option key={t.id} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>
              Decides which fields their product form asks for.
            </span>
          </Field>

          <Field label="Description" id="desc">
            <textarea
              id="desc"
              rows={2}
              value={form.description}
              placeholder="Home baking in Phase 5."
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <Field label="Contact phone" id="phone">
            <input
              id="phone"
              value={form.contactPhone}
              placeholder="+923001234567"
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
          </Field>

          <Field label="Contact email" id="email">
            <input
              id="email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </Field>

          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create brand'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            You’ll add their login on the brand’s own page.
          </span>
        </form>

        <div>
          <div className="toolbar">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                className={`btn ${status === f.value ? '' : 'ghost'}`}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Products</th>
                  <th style={{ textAlign: 'right' }}>Categories</th>
                  <th style={{ textAlign: 'right' }}>Logins</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/brands/${b.id}`}>{b.name}</Link>
                      <div className="muted" style={{ fontSize: 12 }}>
                        /{b.slug}
                      </div>
                    </td>
                    <td>{b.businessType.name}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{b.counts.products}</td>
                    <td style={{ textAlign: 'right' }}>{b.counts.categories}</td>
                    <td style={{ textAlign: 'right' }}>
                      {b.counts.users === 0 ? (
                        <span className="badge warn">none yet</span>
                      ) : (
                        b.counts.users
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {brands.isLoading ? <div className="empty">Loading…</div> : null}
            {!brands.isLoading && rows.length === 0 ? (
              <div className="empty">No brands here yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
