'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import type {
  BrandCategoryView,
  BrandProductView,
  BrandProfileView,
  BrandVariantView,
} from '@haala/shared';
import { businessTypeSpecs, isBusinessTypeKey } from '@haala/shared';
import { ImageUploader } from '@/components/ImageUploader';
import { type Attributes, TypedProductFields } from '@/components/TypedProductFields';
import { ApiError, api, money, toPaisa } from '@/lib/api';

/**
 * One product, in full.
 *
 * The form is in three parts because they answer different questions: what the
 * thing is, what it costs, and what makes it this *kind* of thing. The last one
 * is rendered from the shop's business type, so a bakery is asked about shelf
 * life and a clothing brand about fabric, from a single component.
 *
 * Stock is shown and cannot be edited. Haala holds the inventory in its own
 * stores, so that number is what the warehouse has counted — presenting it as a
 * field the vendor could change would be a lie about who controls it.
 */
const rupees = (paisa: number | null): string => (paisa == null ? '' : String(paisa / 100));

export default function BrandProductPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const profile = useQuery({
    queryKey: ['brand', 'profile'],
    queryFn: () => api.get<BrandProfileView>('/brand/profile'),
  });
  const categories = useQuery({
    queryKey: ['brand', 'categories'],
    queryFn: () => api.get<BrandCategoryView[]>('/brand/categories'),
  });
  const product = useQuery({
    queryKey: ['brand', 'product', id],
    queryFn: () => api.get<BrandProductView>(`/brand/products/${id}`),
  });

  const [form, setForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    imageUrl: '',
    unit: '',
    price: '',
    compareAt: '',
    sku: '',
    isActive: true,
  });
  const [attributes, setAttributes] = useState<Attributes>({});

  // Seed the form once the product arrives, and again if it is refetched after
  // a save, so the inputs never drift from what the server actually holds.
  useEffect(() => {
    const p = product.data;
    if (!p) return;
    setForm({
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? '',
      imageUrl: p.imageUrl ?? '',
      unit: p.unit,
      price: rupees(p.basePrice),
      compareAt: rupees(p.compareAtPrice),
      sku: p.sku ?? '',
      isActive: p.isActive,
    });
    setAttributes(p.attributes ?? {});
  }, [product.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['brand', 'product', id] });
    qc.invalidateQueries({ queryKey: ['brand', 'products'] });
    qc.invalidateQueries({ queryKey: ['brand', 'categories'] });
  };
  const onError = (e: unknown) => {
    setSaved(false);
    setError(e instanceof ApiError ? e.message : 'Could not save');
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch<BrandProductView>(`/brand/products/${id}`, {
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        unit: form.unit.trim(),
        basePrice: toPaisa(form.price),
        compareAtPrice: form.compareAt.trim() ? toPaisa(form.compareAt) : null,
        sku: form.sku.trim() || null,
        attributes,
        isActive: form.isActive,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ ok: true }>(`/brand/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand'] });
      router.push('/brand/products');
    },
    onError,
  });

  const p = product.data;
  if (product.isLoading) return <div className="empty">Loading…</div>;
  if (!p) return <div className="error-banner">Product not found.</div>;

  const typeKey = profile.data?.businessType.key ?? '';
  const variantNoun =
    isBusinessTypeKey(typeKey) ? businessTypeSpecs[typeKey].variantNoun : 'Sizes';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            <Link href="/brand/products">Products</Link> / {p.categoryName}
          </div>
          <h1>{p.name}</h1>
          <p>
            {p.stockOnHand > 0
              ? `${p.stockOnHand} in Haala’s store`
              : 'None in Haala’s store yet — customers cannot buy this'}
          </p>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>On sale</span>
        </label>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {saved && !error ? (
        <div className="card" style={{ padding: 12 }}>
          Saved.
        </div>
      ) : null}

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 340px', gap: 24 }}
      >
        <div style={{ display: 'grid', gap: 24 }}>
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <h2>What it is</h2>

            <div className="field">
              <label htmlFor="f-name">Name</label>
              <input
                id="f-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-cat">Category</label>
              <select
                id="f-cat"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-desc">Description</label>
              <textarea
                id="f-desc"
                rows={4}
                value={form.description}
                placeholder="What makes it worth buying."
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <ImageUploader
              kind="products"
              label="Photo"
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              hint="The picture customers see first. Square photos look best."
            />
          </div>

          <div className="card">
            <TypedProductFields typeKey={typeKey} value={attributes} onChange={setAttributes} />
          </div>

          <Variants productId={id} variants={p.variants} noun={variantNoun} onChanged={invalidate} />
        </div>

        <div style={{ display: 'grid', gap: 24, alignSelf: 'start' }}>
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <h2>Price</h2>

            <div className="field">
              <label htmlFor="f-unit">Sold as</label>
              <input
                id="f-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-price">Price (Rs)</label>
              <input
                id="f-price"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-was">Original price (Rs)</label>
              <input
                id="f-was"
                inputMode="decimal"
                value={form.compareAt}
                onChange={(e) =>
                  setForm({ ...form, compareAt: e.target.value.replace(/[^\d.]/g, '') })
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Optional, and must be higher than the price. Shown struck through, so customers see
                the saving.
              </span>
            </div>

            <div className="field">
              <label htmlFor="f-sku">Your reference</label>
              <input
                id="f-sku"
                value={form.sku}
                placeholder="Optional"
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>

            <button className="btn" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          <div className="card">
            <h2>Remove</h2>
            <p className="muted">
              A product that has been ordered cannot be deleted — it is part of someone’s receipt.
              Switch it off instead and it disappears from the shop.
            </p>
            <button
              className="btn ghost"
              type="button"
              style={{ marginTop: 12 }}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Deleting…' : 'Delete this product'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

/**
 * The sizes, colours or weights a product comes in.
 *
 * Every product has at least one, because stock and baskets are counted per
 * variant rather than per product — a product with none could not be bought,
 * which is why the last one cannot be removed.
 */
function Variants({
  productId,
  variants,
  noun,
  onChanged,
}: {
  productId: string;
  variants: BrandVariantView[];
  noun: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      api.post<BrandProductView>(`/brand/products/${productId}/variants`, {
        label: label.trim(),
        unit: unit.trim() || label.trim(),
        basePrice: toPaisa(price),
      }),
    onSuccess: () => {
      setLabel('');
      setUnit('');
      setPrice('');
      setError(null);
      onChanged();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Could not add'),
  });

  const remove = useMutation({
    mutationFn: (v: BrandVariantView) =>
      api.del<BrandProductView>(`/brand/products/${productId}/variants/${v.id}`),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Could not remove'),
  });

  return (
    <div className="card">
      <h2>{noun}</h2>
      <p className="muted">
        Each one is priced and counted separately. Customers pick between them on the product page.
      </p>

      {error ? (
        <div className="error-banner" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Sold as</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td>{v.label}</td>
                <td className="muted">{v.unit}</td>
                <td style={{ textAlign: 'right' }}>{money(v.basePrice)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={variants.length === 1 || remove.isPending}
                    title={
                      variants.length === 1
                        ? 'A product needs at least one option'
                        : 'Remove this option'
                    }
                    onClick={() => remove.mutate(v)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr auto',
          gap: 10,
          alignItems: 'end',
          marginTop: 14,
        }}
      >
        <div className="field">
          <label htmlFor="v-label">Option</label>
          <input
            id="v-label"
            value={label}
            placeholder="500 g"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="v-unit">Sold as</label>
          <input
            id="v-unit"
            value={unit}
            placeholder="same as option"
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="v-price">Price (Rs)</label>
          <input
            id="v-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </div>
        <button
          className="btn"
          type="button"
          disabled={label.trim().length < 1 || Number(price) <= 0 || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
}
