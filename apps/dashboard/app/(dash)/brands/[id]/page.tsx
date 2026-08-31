'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import type { BrandDetailView, BrandStatus, BrandUserView, BusinessTypeView } from '@haala/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { ApiError, api } from '@/lib/api';

/**
 * One brand: what it is, and who can sign in as it.
 *
 * The password is shown once, immediately after creating the login, and is
 * never retrievable afterwards — it is stored as a bcrypt hash, so there is
 * nothing to show later. Making that explicit on screen is the difference
 * between an operator copying it now and locking a vendor out on day one.
 */
const STATUSES: Array<{ value: BrandStatus; label: string; help: string }> = [
  { value: 'active', label: 'Active', help: 'Selling. Products visible to customers.' },
  { value: 'pending', label: 'Pending', help: 'Set up, not yet selling.' },
  { value: 'suspended', label: 'Suspended', help: 'Catalogue kept, hidden from customers.' },
  { value: 'rejected', label: 'Rejected', help: 'Turned down. Kept for the record.' },
];

export default function BrandDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<{ phone: string; password: string } | null>(null);

  const brand = useQuery({
    queryKey: ['admin', 'brand', id],
    queryFn: () => api.get<BrandDetailView>(`/admin/brands/${id}`),
  });
  const types = useQuery({
    queryKey: ['admin', 'business-types'],
    queryFn: () => api.get<BusinessTypeView[]>('/admin/business-types'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'brand', id] });
    qc.invalidateQueries({ queryKey: ['admin', 'brands'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'That did not work');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<BrandDetailView>(`/admin/brands/${id}`, body),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const toggleUser = useMutation({
    mutationFn: (u: BrandUserView) =>
      api.patch<BrandUserView>(`/admin/brands/${id}/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const b = brand.data;
  if (brand.isLoading) return <div className="empty">Loading…</div>;
  if (!b) return <div className="error-banner">Brand not found.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            <Link href="/brands">Brands</Link> / {b.slug}
          </div>
          <h1>{b.name}</h1>
          <p>
            {b.businessType.name} · {b.counts.products} products · {b.counts.categories} categories
          </p>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 24 }}>
        <div style={{ display: 'grid', gap: 24, alignSelf: 'start' }}>
          <div className="card" style={{ display: 'grid', gap: 12 }}>
            <h2>Status</h2>
            {STATUSES.map((s) => (
              <label
                key={s.value}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="status"
                  checked={b.status === s.value}
                  disabled={patch.isPending}
                  onChange={() => patch.mutate({ status: s.value })}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>{s.label}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.help}
                  </div>
                </span>
              </label>
            ))}
          </div>

          <BrandDetailsCard brand={b} types={types.data ?? []} onSave={(v) => patch.mutate(v)} />
        </div>

        <div style={{ display: 'grid', gap: 24 }}>
          {newPassword ? (
            <div className="card" style={{ borderColor: '#b8860b' }}>
              <h2>Copy this password now</h2>
              <p className="muted">
                It is stored as a hash and cannot be shown again. Send it to the vendor with the
                phone number below.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginTop: 12,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                <span>{newPassword.phone}</span>
                <strong>{newPassword.password}</strong>
              </div>
              <button
                className="btn ghost"
                type="button"
                style={{ marginTop: 12 }}
                onClick={() => setNewPassword(null)}
              >
                Done — hide it
              </button>
            </div>
          ) : null}

          <div className="card">
            <h2>Logins</h2>
            <p className="muted">Each one signs in and sees only this brand.</p>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {b.users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.phone}</td>
                      <td className="muted">{u.email ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={toggleUser.isPending}
                          onClick={() => toggleUser.mutate(u)}
                        >
                          {u.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {b.users.length === 0 ? (
                <div className="empty">No login yet — this brand cannot sign in.</div>
              ) : null}
            </div>
          </div>

          <NewLoginCard
            brandId={id}
            onCreated={(phone, password) => {
              setNewPassword({ phone, password });
              setError(null);
              invalidate();
            }}
            onError={onError}
          />
        </div>
      </div>
    </>
  );
}

function BrandDetailsCard({
  brand,
  types,
  onSave,
}: {
  brand: BrandDetailView;
  types: BusinessTypeView[];
  onSave: (v: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(brand.name);
  const [typeKey, setTypeKey] = useState(brand.businessType.key);
  const [description, setDescription] = useState(brand.description ?? '');
  const [contactPhone, setContactPhone] = useState(brand.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(brand.contactEmail ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.trim(),
      businessTypeKey: typeKey,
      description: description.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
    });
  };

  return (
    <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
      <h2>Details</h2>
      <Field label="Name" id="b-name">
        <input id="b-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Business type" id="b-type">
        <select id="b-type" value={typeKey} onChange={(e) => setTypeKey(e.target.value)}>
          {types
            .filter((t) => t.hasSpec && (t.isActive || t.key === brand.businessType.key))
            .map((t) => (
              <option key={t.id} value={t.key}>
                {t.name}
              </option>
            ))}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>
          Changing this changes which fields their products ask for. Values already saved under the
          old type stay in the database but stop being shown.
        </span>
      </Field>
      <Field label="Description" id="b-desc">
        <textarea
          id="b-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Contact phone" id="b-phone">
        <input
          id="b-phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
      </Field>
      <Field label="Contact email" id="b-email">
        <input
          id="b-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </Field>
      <div className="muted" style={{ fontSize: 12 }}>
        The URL <code>/{brand.slug}</code> is fixed — changing it would break links customers
        already have.
      </div>
      <button className="btn" type="submit">
        Save details
      </button>
    </form>
  );
}

function NewLoginCard({
  brandId,
  onCreated,
  onError,
}: {
  brandId: string;
  onCreated: (phone: string, password: string) => void;
  onError: (e: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post<BrandUserView>(`/admin/brands/${brandId}/users`, {
        name: name.trim(),
        phone: phone.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        password,
      }),
    onSuccess: () => {
      onCreated(phone.trim(), password);
      setName('');
      setPhone('');
      setEmail('');
      setPassword('');
    },
    onError,
  });

  const canSubmit =
    name.trim().length >= 2 && /^\+\d{8,}$/.test(phone.trim()) && password.length >= 8;

  return (
    <form
      className="card"
      style={{ display: 'grid', gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2>Add a login</h2>
      <Field label="Their name" id="u-name">
        <input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Phone — this is the username" id="u-phone">
        <input
          id="u-phone"
          value={phone}
          placeholder="+923001234567"
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field label="Email (optional)" id="u-email">
        <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" id="u-pass">
        <input
          id="u-pass"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <span className="muted" style={{ fontSize: 12 }}>
          At least 8 characters. Shown once after you create it, then never again.
        </span>
      </Field>
      <button className="btn" type="submit" disabled={!canSubmit || create.isPending}>
        {create.isPending ? 'Creating…' : 'Create login'}
      </button>
    </form>
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
