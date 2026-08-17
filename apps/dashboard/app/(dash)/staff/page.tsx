'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { UserRole, type AuthUser } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Staff accounts.
 *
 * This is the **only** way to create a rider or admin: public sign-up always
 * produces a customer, deliberately, because riders can see the name, phone
 * number and address on every packed order. Creating an account here does not
 * sign anyone in — the new rider logs into the rider app themselves.
 */
const ROLES = [
  { value: UserRole.Rider, label: 'Rider' },
  { value: UserRole.Admin, label: 'Admin (ops)' },
  { value: UserRole.Customer, label: 'Customer' },
];

export default function StaffPage() {
  const qc = useQueryClient();
  const [role, setRole] = useState<UserRole>(UserRole.Rider);
  const [listRole, setListRole] = useState<UserRole>(UserRole.Rider);
  const [name, setName] = useState('');
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['ops', 'users', listRole],
    queryFn: () => api.get<AuthUser[]>(`/users?role=${listRole}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<AuthUser>('/users', {
        name: name.trim(),
        phone: `+92${national}`,
        password,
        role,
      }),
    onSuccess: (user) => {
      setError(null);
      setCreated(`${user.name} created — they can sign in with ${user.phone}`);
      setName('');
      setNational('');
      setPassword('');
      qc.invalidateQueries({ queryKey: ['ops', 'users'] });
      qc.invalidateQueries({ queryKey: ['ops', 'riders'] });
    },
    onError: (e) => {
      setCreated(null);
      setError(e instanceof ApiError ? e.message : 'Could not create the account');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const canSubmit =
    name.trim().length >= 2 && national.length === 10 && password.length >= 8 && !create.isPending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p>
            Riders and admins are created here. Public sign-up can only create customers, so this is
            the only route to a staff account.
          </p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {created ? (
        <div
          className="error-banner"
          style={{ background: 'var(--green-50)', color: 'var(--green-700)' }}
        >
          {created}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24 }}>
        <form
          className="card"
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start' }}
        >
          <h2>New account</h2>

          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="phone">Phone</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  padding: '9px 12px',
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
              >
                +92
              </span>
              <input
                id="phone"
                inputMode="numeric"
                placeholder="300 1234567"
                value={national}
                onChange={(e) => setNational(e.target.value.replace(/\D/g, '').slice(0, 10))}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pw">Temporary password</label>
            <input
              id="pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Share this with them directly; they’ll use it to sign in.
            </span>
          </div>

          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div>
          <div className="toolbar">
            {ROLES.map((r) => (
              <button
                key={r.value}
                className={`btn sm ${listRole === r.value ? '' : 'ghost'}`}
                onClick={() => setListRole(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.isLoading ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      Loading…
                    </td>
                  </tr>
                ) : (users.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      No accounts with this role.
                    </td>
                  </tr>
                ) : (
                  (users.data ?? []).map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.name}</td>
                      <td>{u.phone}</td>
                      <td className="muted">{u.email ?? '—'}</td>
                      <td>
                        <span className="badge neutral">{u.role}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
