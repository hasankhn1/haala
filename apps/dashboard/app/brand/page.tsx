'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { BrandCategoryView, BrandProductView, BrandProfileView } from '@haala/shared';
import { api, money } from '@/lib/api';

/**
 * The vendor's first screen.
 *
 * It answers "is my shop ready to sell?" rather than showing sales figures —
 * there are no orders yet, and a dashboard of zeroes teaches nobody anything.
 * What it does surface is the things that quietly stop a product being sold:
 * no price, switched off, or no stock in a Haala store.
 */
export default function BrandHome() {
  const profile = useQuery({
    queryKey: ['brand', 'profile'],
    queryFn: () => api.get<BrandProfileView>('/brand/profile'),
  });
  const products = useQuery({
    queryKey: ['brand', 'products'],
    queryFn: () => api.get<BrandProductView[]>('/brand/products'),
  });
  const categories = useQuery({
    queryKey: ['brand', 'categories'],
    queryFn: () => api.get<BrandCategoryView[]>('/brand/categories'),
  });

  const all = products.data ?? [];
  const live = all.filter((p) => p.isActive);
  const noStock = live.filter((p) => p.stockOnHand <= 0);
  const catalogueValue = all.reduce((sum, p) => sum + p.basePrice, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{profile.data?.name ?? 'Your shop'}</h1>
          <p>
            {profile.data
              ? `${profile.data.businessType.name} · haala.pk/${profile.data.slug}`
              : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Products" value={String(all.length)} sub={`${live.length} switched on`} />
        <Metric label="Categories" value={String((categories.data ?? []).length)} />
        <Metric
          label="Average price"
          value={all.length ? money(Math.round(catalogueValue / all.length)) : '—'}
        />
        <Metric
          label="Waiting on stock"
          value={String(noStock.length)}
          sub={noStock.length ? 'Haala has none of these' : 'nothing waiting'}
        />
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Start with a category</h2>
          <p className="muted">
            Products live inside categories — Cakes, Pastries, Breads. Make one, then add what you
            sell to it.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Link className="btn" href="/brand/categories">
              Add a category
            </Link>
          </div>
        </div>
      ) : null}

      {noStock.length > 0 ? (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Not sellable right now</h2>
          <p className="muted">
            These are switched on, but Haala has none in the store — so customers cannot buy them.
            Stock is counted by Haala, not here; get in touch when you have delivered more.
          </p>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {noStock.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/brand/products/${p.id}`}>{p.name}</Link>
                    </td>
                    <td className="muted">{p.categoryName}</td>
                    <td style={{ textAlign: 'right' }}>{money(p.basePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}
