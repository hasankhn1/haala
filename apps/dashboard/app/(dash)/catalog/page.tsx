'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { OpsCatalogRow, OpsStoreView } from '@haala/shared';
import { ApiError, api, money, toPaisa } from '@/lib/api';

/**
 * Catalogue and pricing.
 *
 * Prices are per store: `basePrice` is the catalogue-wide figure and a store
 * may override it. Both are edited here, side by side, because "why is this
 * Rs 20 cheaper in Gulberg" is the question an operator actually has.
 *
 * Money is integer paisa everywhere in the system; operators type rupees, and
 * the conversion happens at this edge only.
 */
export default function CatalogPage() {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<OpsStoreView[]>('/ops/stores'),
  });

  // Default to the first store once the list arrives.
  useEffect(() => {
    if (!storeId && stores.data?.[0]) setStoreId(stores.data[0].id);
  }, [stores.data, storeId]);

  const catalog = useQuery({
    queryKey: ['ops', 'catalog', storeId],
    queryFn: () => api.get<OpsCatalogRow[]>(`/ops/stores/${storeId}/catalog`),
    enabled: Boolean(storeId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ops', 'catalog', storeId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Update failed');

  const saveProduct = useMutation({
    mutationFn: (vars: { productId: string; basePrice: number }) =>
      api.patch(`/ops/products/${vars.productId}`, { basePrice: vars.basePrice }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const saveInventory = useMutation({
    mutationFn: (vars: {
      productId: string;
      quantityAvailable?: number;
      price?: number | null;
    }) => {
      const { productId, ...body } = vars;
      return api.patch(`/ops/stores/${storeId}/inventory/${productId}`, body);
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const rows = catalog.data ?? [];
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.categoryName))).sort(),
    [rows],
  );
  const visible = rows.filter(
    (r) =>
      (category === 'all' || r.categoryName === category) &&
      (search.trim() === '' || r.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const outOfStock = rows.filter((r) => r.availableToSell === 0).length;
  const onOffer = rows.filter((r) => r.storePrice !== null).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p>
            Edit the catalogue price, this store’s override and stock. Press Enter or click away to
            save.
          </p>
        </div>
        <button className="btn ghost" onClick={() => catalog.refetch()}>
          Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="stat-row">
        <div className="stat">
          <div className="value">{rows.length}</div>
          <div className="label">Products</div>
        </div>
        <div className="stat">
          <div className="value">{outOfStock}</div>
          <div className="label">Out of stock</div>
        </div>
        <div className="stat">
          <div className="value">{onOffer}</div>
          <div className="label">Store overrides</div>
        </div>
        <div className="stat">
          <div className="value">{categories.length}</div>
          <div className="label">Categories</div>
        </div>
      </div>

      <div className="toolbar">
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {(stores.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <span className="muted">{visible.length} shown</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th className="num">Base price</th>
              <th className="num">Store price</th>
              <th className="num">Customer pays</th>
              <th className="num">Stock</th>
              <th className="num">Reserved</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {catalog.isLoading ? (
              <tr>
                <td colSpan={8} className="empty">
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  No products match.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.productId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="muted">{r.unit}</div>
                  </td>
                  <td className="muted">{r.categoryName}</td>

                  <td className="num">
                    <RupeeInput
                      paisa={r.basePrice}
                      onCommit={(paisa) => {
                        // `allowEmpty` is off for the base price, so null can't
                        // reach here — but the callback type permits it.
                        if (paisa !== null) {
                          saveProduct.mutate({ productId: r.productId, basePrice: paisa });
                        }
                      }}
                    />
                  </td>

                  <td className="num">
                    <RupeeInput
                      paisa={r.storePrice}
                      allowEmpty
                      placeholder="—"
                      onCommit={(paisa) =>
                        saveInventory.mutate({ productId: r.productId, price: paisa })
                      }
                    />
                  </td>

                  <td className="num" style={{ fontWeight: 700 }}>
                    {money(r.effectivePrice)}
                  </td>

                  <td className="num">
                    <NumberInput
                      value={r.quantityAvailable}
                      onCommit={(qty) =>
                        saveInventory.mutate({ productId: r.productId, quantityAvailable: qty })
                      }
                    />
                  </td>
                  <td className="num muted">{r.quantityReserved}</td>

                  <td>
                    {!r.isActive ? (
                      <span className="badge neutral">Hidden</span>
                    ) : r.availableToSell === 0 ? (
                      <span className="badge bad">Out of stock</span>
                    ) : r.availableToSell < 10 ? (
                      <span className="badge warn">Low</span>
                    ) : (
                      <span className="badge good">In stock</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Rupee field over a paisa value. Commits on blur/Enter rather than per
 * keystroke — a PATCH for every digit typed would be both noisy and, mid-edit,
 * briefly wrong.
 */
function RupeeInput({
  paisa,
  onCommit,
  allowEmpty = false,
  placeholder,
}: {
  paisa: number | null;
  onCommit: (paisa: number | null) => void;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const toText = (p: number | null) => (p === null ? '' : String(Math.round(p / 100)));
  const [text, setText] = useState(toText(paisa));

  // Re-sync when the server value changes underneath (refetch, other operator).
  useEffect(() => setText(toText(paisa)), [paisa]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (allowEmpty && paisa !== null) onCommit(null);
      else setText(toText(paisa));
      return;
    }
    const next = toPaisa(trimmed);
    if (!Number.isFinite(next) || next < 0) {
      setText(toText(paisa));
      return;
    }
    if (next !== paisa) onCommit(next);
  };

  return (
    <input
      className="inline"
      value={text}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setText(toText(paisa));
      }}
    />
  );
}

function NumberInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const next = Number(text.trim());
    if (!Number.isInteger(next) || next < 0) {
      setText(String(value));
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      className="inline"
      style={{ width: 72 }}
      value={text}
      inputMode="numeric"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setText(String(value));
      }}
    />
  );
}
