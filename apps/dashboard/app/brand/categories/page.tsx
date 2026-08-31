'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import type { BrandCategoryView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Categories — how a shop arranges itself for customers.
 *
 * Order matters, because this is the order shoppers see, so reordering is a
 * first-class action rather than a hidden number field. It sends the whole list
 * in one request: dragging one row to the top changes every position below it,
 * and eight separate requests could half-apply.
 *
 * A category holding products cannot be deleted — the products would be
 * orphaned, and the database refuses it. The button says so rather than
 * failing on click.
 */
export default function BrandCategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ['brand', 'categories'],
    queryFn: () => api.get<BrandCategoryView[]>('/brand/categories'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['brand', 'categories'] });
    qc.invalidateQueries({ queryKey: ['brand', 'products'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'That did not work');
  const onDone = () => {
    setError(null);
    invalidate();
  };

  const create = useMutation({
    mutationFn: () => api.post<BrandCategoryView>('/brand/categories', { name: name.trim() }),
    onSuccess: () => {
      setName('');
      onDone();
    },
    onError,
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      api.patch<BrandCategoryView>(`/brand/categories/${v.id}`, { name: v.name }),
    onSuccess: onDone,
    onError,
  });

  const toggle = useMutation({
    mutationFn: (c: BrandCategoryView) =>
      api.patch<BrandCategoryView>(`/brand/categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: onDone,
    onError,
  });

  const remove = useMutation({
    mutationFn: (c: BrandCategoryView) => api.del<{ ok: true }>(`/brand/categories/${c.id}`),
    onSuccess: onDone,
    onError,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api.patch<BrandCategoryView[]>('/brand/categories/reorder', { ids }),
    onSuccess: onDone,
    onError,
  });

  const rows = categories.data ?? [];

  const move = (index: number, by: number) => {
    const next = [...rows];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    reorder.mutate(next.map((c) => c.id));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Categories</h1>
          <p>The sections of your shop, in the order customers see them.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) 1fr', gap: 24 }}>
        <form
          className="card"
          style={{ display: 'grid', gap: 14, alignSelf: 'start' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>New category</h2>
          <div className="field">
            <label htmlFor="cat-name">Name</label>
            <input
              id="cat-name"
              value={name}
              placeholder="Cakes"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={name.trim().length < 2 || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add category'}
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Order</th>
                <th>Name</th>
                <th style={{ textAlign: 'right' }}>Products</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.55 }}>
                  <td>
                    <button
                      className="btn ghost"
                      type="button"
                      aria-label={`Move ${c.name} up`}
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      aria-label={`Move ${c.name} down`}
                      disabled={i === rows.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </td>
                  <td>
                    <input
                      defaultValue={c.name}
                      aria-label={`Rename ${c.name}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next.length >= 2 && next !== c.name) {
                          rename.mutate({ id: c.id, name: next });
                        }
                      }}
                    />
                    {c.isActive ? null : (
                      <span className="badge neutral" style={{ marginLeft: 8 }}>
                        hidden
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{c.productCount}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost" type="button" onClick={() => toggle.mutate(c)}>
                      {c.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={c.productCount > 0 || remove.isPending}
                      title={
                        c.productCount > 0
                          ? 'Move or delete its products first'
                          : 'Delete this category'
                      }
                      onClick={() => remove.mutate(c)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.isLoading ? <div className="empty">Loading…</div> : null}
          {!categories.isLoading && rows.length === 0 ? (
            <div className="empty">No categories yet. Add one on the left to get started.</div>
          ) : null}
        </div>
      </div>
    </>
  );
}
