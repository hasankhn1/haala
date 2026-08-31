'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import type { BusinessTypeView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Business types — the kinds of business the platform sells for.
 *
 * A type is half a database row and half code. This page edits the row: its
 * name, its order, whether it is offered. What it cannot edit is the product
 * fields, which live in `businessTypeSpecs` and are validated with zod — a form
 * that sets prices is not somewhere to discover a typo, so those ship with a
 * deploy rather than a text box.
 *
 * That split is why "Fields" is shown read-only, and why a row with no matching
 * registry entry is called out: it is a type nobody can sell under.
 */
export default function BusinessTypesPage() {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['admin', 'business-types'],
    queryFn: () => api.get<BusinessTypeView[]>('/admin/business-types'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'business-types'] });
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'That did not work');

  const create = useMutation({
    mutationFn: () => api.post<BusinessTypeView>('/admin/business-types', { key: key.trim(), name: name.trim() }),
    onSuccess: () => {
      setKey('');
      setName('');
      setError(null);
      invalidate();
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: (t: BusinessTypeView) =>
      api.patch<BusinessTypeView>(`/admin/business-types/${t.id}`, { isActive: !t.isActive }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const rows = types.data ?? [];
  const canSubmit =
    /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(key.trim()) && name.trim().length >= 2 && !create.isPending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business types</h1>
          <p>What kind of business a brand is, and therefore what its product form asks for.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: 24 }}>
        <form
          className="card"
          style={{ display: 'grid', gap: 14, alignSelf: 'start' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>New type</h2>
          <div className="field">
            <label htmlFor="key">Key</label>
            <input
              id="key"
              value={key}
              placeholder="home_decor"
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Lower case and underscores. Permanent — code refers to it.
            </span>
          </div>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={name}
              placeholder="Home décor"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Adding…' : 'Add type'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            A new type has no product fields until a matching entry ships in{' '}
            <code>businessTypeSpecs</code>. Until then brands cannot be assigned to it.
          </span>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Key</th>
                <th>Product fields</th>
                <th style={{ textAlign: 'right' }}>Brands</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={t.isActive ? undefined : { opacity: 0.55 }}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.isActive ? null : (
                      <span className="badge neutral" style={{ marginLeft: 8 }}>
                        not offered
                      </span>
                    )}
                  </td>
                  <td className="muted">
                    <code>{t.key}</code>
                  </td>
                  <td>
                    {t.hasSpec ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t.fields.map((f) => f.label).join(', ') || 'none beyond the basics'}
                      </span>
                    ) : (
                      <span className="badge bad">no spec shipped</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{t.brandCount}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={toggle.isPending}
                      title={
                        t.isActive && t.brandCount > 0
                          ? 'Brands still use this type'
                          : undefined
                      }
                      onClick={() => toggle.mutate(t)}
                    >
                      {t.isActive ? 'Stop offering' : 'Offer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {types.isLoading ? <div className="empty">Loading…</div> : null}
        </div>
      </div>
    </>
  );
}
