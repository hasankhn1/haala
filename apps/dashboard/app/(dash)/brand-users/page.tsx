'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type { BrandUserRow, BrandUserView, BrandView } from '@haala/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { ApiError, api } from '@/lib/api';

/**
 * Every login that belongs to a shop, and the one place to make another.
 *
 * The brand pages can each add their own login, but onboarding several
 * businesses in a sitting means picking a shop from a list rather than
 * navigating into one, coming back, and navigating into the next.
 *
 * Creating still posts to `/admin/brands/<id>/users` — the brand travels in the
 * path, so the dropdown is a convenience for the operator and not a field the
 * request could get wrong.
 */

/** Readable and strong enough: ~62 bits, no ambiguous characters. */
function suggestPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const body = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export default function BrandUsersPage() {
  const qc = useQueryClient();
  const [brandId, setBrandId] = useState('');
  const [name, setName] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ shop: string; phone: string; password: string } | null>(
    null,
  );

  const brands = useQuery({
    queryKey: ['admin', 'brands', 'all'],
    queryFn: () => api.get<BrandView[]>('/admin/brands'),
  });
  const users = useQuery({
    queryKey: ['admin', 'brand-users'],
    queryFn: () => api.get<BrandUserRow[]>('/admin/brand-users'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'brand-users'] });
    qc.invalidateQueries({ queryKey: ['admin', 'brands'] });
  };
  const onError = (e: unknown) => {
    setIssued(null);
    setError(e instanceof ApiError ? e.message : 'Could not create the login');
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<BrandUserView>(`/admin/brands/${brandId}/users`, {
        name: name.trim(),
        phone: `+92${national}`,
        ...(email.trim() ? { email: email.trim() } : {}),
        password,
      }),
    onSuccess: () => {
      const shop = (brands.data ?? []).find((b) => b.id === brandId)?.name ?? 'the shop';
      setIssued({ shop, phone: `+92${national}`, password });
      setError(null);
      setName('');
      setNational('');
      setEmail('');
      setPassword('');
      invalidate();
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: (u: BrandUserRow) =>
      api.patch<BrandUserView>(`/admin/brands/${u.brand.id}/users/${u.id}`, {
        isActive: !u.isActive,
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const rows = users.data ?? [];
  const shops = brands.data ?? [];
  const withoutLogin = shops.filter((b) => b.counts.users === 0);

  const canSubmit =
    brandId !== '' &&
    name.trim().length >= 2 &&
    /^\d{10}$/.test(national) &&
    password.length >= 8 &&
    !create.isPending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shop logins</h1>
          <p>Who can sign in for each business. One login sees one shop and nothing else.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {issued ? (
        <div className="card" style={{ borderColor: '#b8860b' }}>
          <h2>Send these to {issued.shop}</h2>
          <p className="muted">
            The password is shown once. It is stored as a hash, so nobody — including us — can read
            it back afterwards.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 12,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 15,
            }}
          >
            <span>{issued.phone}</span>
            <strong>{issued.password}</strong>
          </div>
          <button
            className="btn ghost"
            type="button"
            style={{ marginTop: 12 }}
            onClick={() => setIssued(null)}
          >
            Done — hide it
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: 24 }}>
        <form
          className="card"
          style={{ display: 'grid', gap: 14, alignSelf: 'start' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>New login</h2>

          <div className="field">
            <label htmlFor="u-brand">Shop</label>
            <select id="u-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Choose a shop…</option>
              {shops.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.counts.users === 0 ? ' — no login yet' : ''}
                </option>
              ))}
            </select>
            {shops.length === 0 && !brands.isLoading ? (
              <span className="muted" style={{ fontSize: 12 }}>
                No shops yet — <Link href="/brands">create one first</Link>.
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="u-name">Their name</label>
            <input
              id="u-name"
              value={name}
              placeholder="Sarah"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="u-phone">Phone — this is the username</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted">+92</span>
              <input
                id="u-phone"
                inputMode="numeric"
                value={national}
                placeholder="3001234567"
                onChange={(e) => setNational(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Ten digits. Must not already be used by any other account.
            </span>
          </div>

          <div className="field">
            <label htmlFor="u-email">Email (optional)</label>
            <input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="u-pass">Password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="u-pass"
                value={password}
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="btn ghost"
                type="button"
                onClick={() => setPassword(suggestPassword())}
              >
                Suggest
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              At least 8 characters. Shown once after you create it.
            </span>
          </div>

          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create login'}
          </button>
        </form>

        <div>
          {withoutLogin.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <strong>
                {withoutLogin.length} shop{withoutLogin.length === 1 ? '' : 's'} cannot sign in yet
              </strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {withoutLogin.map((b) => b.name).join(', ')}
              </div>
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Signs in as</th>
                  <th>Shop</th>
                  <th>Shop status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} style={u.isActive ? undefined : { opacity: 0.55 }}>
                    <td>
                      {u.name}
                      {u.isActive ? null : (
                        <span className="badge neutral" style={{ marginLeft: 8 }}>
                          disabled
                        </span>
                      )}
                      {u.email ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {u.email}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.phone}</td>
                    <td>
                      <Link href={`/brands/${u.brand.id}`}>{u.brand.name}</Link>
                    </td>
                    <td>
                      <StatusBadge status={u.brand.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(u)}
                      >
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.isLoading ? <div className="empty">Loading…</div> : null}
            {!users.isLoading && rows.length === 0 ? (
              <div className="empty">No shop logins yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
