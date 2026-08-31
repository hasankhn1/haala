'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { BrandCategoryView, BrandProductView, BrandProfileView } from '@haala/shared';
import { coreLabelsFor } from '@haala/shared';
import { ApiError, api, money, toPaisa } from '@/lib/api';

/**
 * Everything the shop sells.
 *
 * Creating a product asks for the four things it cannot be sold without — what
 * it is, where it belongs, how it is measured and what it costs — and nothing
 * else. Descriptions, photos, sizes and the business-type details are all on
 * the product's own page, because a long form at the front of the task is how
 * people stop halfway.
 */
export default function BrandProductsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [form, setForm] = useState({ categoryId: '', name: '', unit: '', price: '' });

  const profile = useQuery({
    queryKey: ['brand', 'profile'],
    queryFn: () => api.get<BrandProfileView>('/brand/profile'),
  });
  const categories = useQuery({
    queryKey: ['brand', 'categories'],
    queryFn: () => api.get<BrandCategoryView[]>('/brand/categories'),
  });
  const products = useQuery({
    queryKey: ['brand', 'products'],
    queryFn: () => api.get<BrandProductView[]>('/brand/products'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<BrandProductView>('/brand/products', {
        categoryId: form.categoryId,
        name: form.name.trim(),
        unit: form.unit.trim(),
        basePrice: toPaisa(form.price),
      }),
    onSuccess: (p) => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['brand'] });
      // Straight into the full editor, which is where the rest of the work is.
      router.push(`/brand/products/${p.id}`);
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : 'Could not add the product'),
  });

  const toggle = useMutation({
    mutationFn: (p: BrandProductView) =>
      api.patch<BrandProductView>(`/brand/products/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand'] }),
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Could not update'),
  });

  const cats = categories.data ?? [];
  const words = coreLabelsFor(profile.data?.businessType.key ?? '');
  const rows = (products.data ?? []).filter((p) => !filter || p.categoryId === filter);
  const priceOk = form.price.trim() !== '' && Number.isFinite(Number(form.price)) && Number(form.price) > 0;
  const canSubmit =
    form.categoryId !== '' &&
    form.name.trim().length >= 2 &&
    form.unit.trim().length >= 1 &&
    priceOk &&
    !create.isPending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p>What you sell. Tap a name to add photos, sizes and the rest.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {cats.length === 0 && !categories.isLoading ? (
        <div className="card">
          <h2>Make a category first</h2>
          <p className="muted">Every product sits in one, so there is nowhere to put this yet.</p>
          <Link className="btn" href="/brand/categories" style={{ marginTop: 12 }}>
            Add a category
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: 24 }}>
          <form
            className="card"
            style={{ display: 'grid', gap: 14, alignSelf: 'start' }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <h2>New product</h2>

            <div className="field">
              <label htmlFor="p-cat">Category</label>
              <select
                id="p-cat"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Choose…</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="p-name">{words.name}</label>
              <input
                id="p-name"
                value={form.name}
                placeholder={words.name === 'Suit title' ? 'Embroidered lawn 3-piece' : 'Chocolate fudge cake'}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="p-unit">{words.unit}</label>
              <input
                id="p-unit"
                value={form.unit}
                placeholder="1 kg"
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                How much the customer gets for the price below.
              </span>
            </div>

            <div className="field">
              <label htmlFor="p-price">Now price (Rs)</label>
              <input
                id="p-price"
                inputMode="decimal"
                value={form.price}
                placeholder="2500"
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </div>

            <button className="btn" type="submit" disabled={!canSubmit}>
              {create.isPending ? 'Adding…' : 'Add product'}
            </button>
          </form>

          <div>
            {cats.length > 1 ? (
              <div className="toolbar">
                <button
                  type="button"
                  className={`btn ${filter === '' ? '' : 'ghost'}`}
                  onClick={() => setFilter('')}
                >
                  All
                </button>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn ${filter === c.id ? '' : 'ghost'}`}
                    onClick={() => setFilter(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Sizes</th>
                    <th style={{ textAlign: 'right' }}>In store</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.55 }}>
                      <td>
                        <Link href={`/brand/products/${p.id}`}>{p.name}</Link>
                        {p.isActive ? null : (
                          <span className="badge neutral" style={{ marginLeft: 8 }}>
                            off
                          </span>
                        )}
                      </td>
                      <td className="muted">{p.categoryName}</td>
                      <td style={{ textAlign: 'right' }}>
                        {money(p.basePrice)}
                        {p.compareAtPrice ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            was {money(p.compareAtPrice)}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.variants.length}</td>
                      <td style={{ textAlign: 'right' }}>
                        {p.stockOnHand > 0 ? (
                          p.stockOnHand
                        ) : (
                          <span className="badge warn">none</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn ghost" type="button" onClick={() => toggle.mutate(p)}>
                          {p.isActive ? 'Switch off' : 'Switch on'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.isLoading ? <div className="empty">Loading…</div> : null}
              {!products.isLoading && rows.length === 0 ? (
                <div className="empty">Nothing here yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
