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
import { businessTypeSpecs, coreLabelsFor, isBusinessTypeKey, picksSizes } from '@haala/shared';
import { ImageGallery } from '@/components/ImageGallery';
import { type Attributes, TypedProductFields } from '@/components/TypedProductFields';
import { ApiError, api, toPaisa } from '@/lib/api';
import { FieldTag } from '@/components/FieldTag';

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
  const [needSizes, setNeedSizes] = useState(false);

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
    unit: '',
    price: '',
    compareAt: '',
    sku: '',
    isActive: true,
  });
  const [attributes, setAttributes] = useState<Attributes>({});
  const [images, setImages] = useState<string[]>([]);

  // Seed the form once the product arrives, and again if it is refetched after
  // a save, so the inputs never drift from what the server actually holds.
  useEffect(() => {
    const p = product.data;
    if (!p) return;
    setForm({
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? '',
      unit: p.unit,
      price: rupees(p.basePrice),
      compareAt: rupees(p.compareAtPrice),
      sku: p.sku ?? '',
      isActive: p.isActive,
    });
    setAttributes(p.attributes ?? {});
    setImages(p.images ?? []);
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
        images,
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
  // The profile decides the size charts, which `Variants` reads once on mount.
  if (product.isLoading || profile.isLoading) return <div className="empty">Loading…</div>;
  if (!p) return <div className="error-banner">Product not found.</div>;

  const typeKey = profile.data?.businessType.key ?? '';
  const variantNoun = isBusinessTypeKey(typeKey) ? businessTypeSpecs[typeKey].variantNoun : 'Sizes';
  // Clothing is the one type with a colour axis: its options are picked from
  // size chips and a colour list rather than typed one at a time.
  const pickAxes = picksSizes(typeKey);
  // A boutique calls it a suit title; a baker calls it what they baked. Same
  // column, different word on the form.
  const words = coreLabelsFor(typeKey);

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
          // Until a size exists, the only row is the automatic one named after
          // "Sold as" — a clothing product is not finished without real sizes.
          if (pickAxes && !p.variants.some((v) => v.options.size)) {
            setNeedSizes(true);
            document
              .getElementById('sizes')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
          save.mutate();
        }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 340px', gap: 24 }}
      >
        <div style={{ display: 'grid', gap: 24 }}>
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <h2>What it is</h2>

            <div className="field">
              <label htmlFor="f-name">
                {words.name} <FieldTag required />
              </label>
              <input
                id="f-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-cat">
                Category <FieldTag required />
              </label>
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
              <label htmlFor="f-desc">
                {words.description} <FieldTag />
              </label>
              <textarea
                id="f-desc"
                rows={4}
                value={form.description}
                placeholder={words.descriptionPlaceholder}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <ImageGallery optional label={words.images} value={images} onChange={setImages} />
          </div>

          <div className="card">
            <TypedProductFields typeKey={typeKey} value={attributes} onChange={setAttributes} />
          </div>

          <Variants
            productId={id}
            variants={p.variants}
            noun={variantNoun}
            pickAxes={pickAxes}
            sizeSets={isBusinessTypeKey(typeKey) ? (businessTypeSpecs[typeKey].sizeSets ?? {}) : {}}
            needSizes={needSizes}
            onChanged={invalidate}
          />
        </div>

        <div style={{ display: 'grid', gap: 24, alignSelf: 'start' }}>
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <h2>Price</h2>

            <div className="field">
              <label htmlFor="f-unit">
                {words.unit} <FieldTag required />
              </label>
              <input
                id="f-unit"
                value={form.unit}
                placeholder={pickAxes ? words.unitPlaceholder : undefined}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              {/* Clothing renames this field, so it says what the line is for. */}
              {pickAxes ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  {words.unitHelp}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="f-price">
                Now price (Rs) <FieldTag required />
              </label>
              <input
                id="f-price"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-was">
                Was price (Rs) <FieldTag />
              </label>
              <input
                id="f-was"
                inputMode="decimal"
                value={form.compareAt}
                onChange={(e) =>
                  setForm({ ...form, compareAt: e.target.value.replace(/[^\d.]/g, '') })
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Must be higher than the now price. Shown struck through, so customers see the
                saving.
              </span>
            </div>

            <div className="field">
              <label htmlFor="f-sku">
                Your reference <FieldTag />
              </label>
              <input
                id="f-sku"
                value={form.sku}
                placeholder="SKU-1042"
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

// A clothing row's label doubles as its `unit`, which the API caps at 40:
// "<size> / <colour>" must fit, or a batch fails halfway. Chart sizes are
// at most 10 ("Unstitched"), so 15 + 3 + 20 = 38.
const MAX_SIZE = 15;
const MAX_COLOUR = 20;

/**
 * The sizes, colours or weights a product comes in.
 *
 * Every product has at least one, because stock and baskets are counted per
 * variant rather than per product — a product with none could not be bought,
 * which is why the last one cannot be removed.
 *
 * Clothing (`pickAxes`) adds every picked size × colour pair at once, and
 * records the pair in `options` so the customer app can offer two pickers.
 * Sizes come from a chart (clothing, shoes, kids — see `sizeSets`) or are
 * typed, for the odd one no chart lists.
 */
function Variants({
  productId,
  variants,
  noun,
  pickAxes,
  sizeSets,
  needSizes,
  onChanged,
}: {
  productId: string;
  variants: BrandVariantView[];
  noun: string;
  pickAxes: boolean;
  sizeSets: Record<string, string[]>;
  needSizes: boolean;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const chartNames = Object.keys(sizeSets);
  const [chart, setChart] = useState(chartNames[0] ?? '');
  const [sizes, setSizes] = useState<string[]>([]);
  const [sizeDraft, setSizeDraft] = useState('');
  const [colours, setColours] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A colour typed but not yet committed with Enter still counts.
  const withDraft = (list: string[], text: string) => {
    const c = text.trim();
    return c && !list.some((x) => x.toLowerCase() === c.toLowerCase()) ? [...list, c] : list;
  };
  // A typed "red" or "xl" takes the spelling already in use — this product's
  // own rows first, then the size charts — so the customer's picker shows one
  // Red rather than "Red" and "red" as two colours.
  const spelling = new Map<string, string>();
  for (const s of Object.values(sizeSets).flat()) spelling.set(s.toLowerCase(), s);
  for (const v of variants) {
    for (const s of [v.options.size, v.options.color]) if (s) spelling.set(s.toLowerCase(), s);
  }
  const canon = (s: string) => spelling.get(s.toLowerCase()) ?? s;
  const colourList = withDraft(colours, draft).map(canon);
  const sizeList = withDraft(sizes, sizeDraft).map(canon);
  // Case-insensitive, so "red" beside an existing "M / Red" is not a second row.
  const taken = new Set(variants.map((v) => v.label.toLowerCase()));
  const combos = sizeList
    .flatMap((size) =>
      colourList.length
        ? colourList.map((color) => ({ label: `${size} / ${color}`, options: { size, color } }))
        : [{ label: size, options: { size } }],
    )
    .filter((c) => !taken.has(c.label.toLowerCase()))
    // "xl" typed and "XL" clicked are one size; a repeat would fail the batch
    // halfway on the unique label.
    .filter(
      (c, i, all) => all.findIndex((x) => x.label.toLowerCase() === c.label.toLowerCase()) === i,
    );
  // Set by a blocked save; clears itself once a real size exists.
  const missing = pickAxes && needSizes && !variants.some((v) => v.options.size);
  const red = missing ? { borderColor: 'var(--red-600)' } : undefined;
  // Clothing's automatic row from quick-create, named after the subtitle. It
  // is not a size, so it is hidden from the table and renamed by the first Add.
  const placeholder =
    pickAxes && variants.length === 1 && Object.keys(variants[0]!.options).length === 0;

  const add = useMutation({
    mutationFn: async () => {
      if (!pickAxes) {
        return api.post<BrandProductView>(`/brand/products/${productId}/variants`, {
          label: label.trim(),
          unit: unit.trim() || label.trim(),
          basePrice: toPaisa(price),
        });
      }
      // The automatic row from quick-create ("1 piece") becomes the first pair
      // rather than sitting beside the sizes. Renamed, not deleted: it holds
      // sort_order 0, which the catalogue prices the card from. Safe because
      // the API refuses stock on a sizeless clothing row, so nothing is
      // attached to it for the rename to carry over.
      const [only] = variants;
      const rest = placeholder ? combos.slice(1) : combos;
      if (rest !== combos && only && combos[0]) {
        await api.patch<BrandProductView>(`/brand/products/${productId}/variants/${only.id}`, {
          label: combos[0].label,
          unit: combos[0].label,
          basePrice: toPaisa(price),
          options: combos[0].options,
        });
      }
      // ponytail: one request per pair; a bulk endpoint if vendors add 50+ at once.
      for (const c of rest) {
        await api.post<BrandProductView>(`/brand/products/${productId}/variants`, {
          label: c.label,
          unit: c.label,
          basePrice: toPaisa(price),
          options: c.options,
        });
      }
    },
    onSuccess: () => {
      setLabel('');
      setUnit('');
      setSizes([]);
      setSizeDraft('');
      setColours([]);
      setDraft('');
      setPrice('');
      setError(null);
      onChanged();
    },
    // A failure halfway through a batch has still added the pairs before it.
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Could not add');
      onChanged();
    },
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

  const reprice = useMutation({
    mutationFn: ({ v, basePrice }: { v: BrandVariantView; basePrice: number }) =>
      api.patch<BrandProductView>(`/brand/products/${productId}/variants/${v.id}`, { basePrice }),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'Could not save price'),
  });

  const canAdd = pickAxes ? combos.length > 0 : label.trim().length > 0;

  return (
    <div className="card" id="sizes">
      <h2>{noun}</h2>
      <p className="muted">
        Each one is priced and counted separately. Customers pick between them on the product page.
      </p>

      {error ? (
        <div className="error-banner" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {placeholder ? (
        <p className="muted" style={{ marginTop: 12 }}>
          No sizes yet — pick sizes below.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Option</th>
                {pickAxes ? null : <th>Sold as</th>}
                <th style={{ textAlign: 'right' }}>Price (Rs)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.label}</td>
                  {pickAxes ? null : <td className="muted">{v.unit}</td>}
                  <td style={{ textAlign: 'right' }}>
                    <PriceCell
                      paisa={v.basePrice}
                      disabled={reprice.isPending}
                      onSave={(basePrice) => reprice.mutate({ v, basePrice })}
                    />
                  </td>
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
      )}

      {pickAxes ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <div className="field">
            <label htmlFor="v-chart">
              Sizes <FieldTag required />
            </label>
            {chartNames.length > 1 ? (
              <select
                id="v-chart"
                value={chart}
                style={{ maxWidth: 200 }}
                onChange={(e) => setChart(e.target.value)}
              >
                {chartNames.map((n) => (
                  <option key={n} value={n}>
                    {n} sizes
                  </option>
                ))}
              </select>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* Picked sizes from another chart or typed by hand stay visible. */}
              {[
                ...(sizeSets[chart] ?? []),
                ...sizes.filter((s) => !sizeSets[chart]?.includes(s)),
              ].map((s) => {
                const on = sizes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={on ? 'btn' : 'btn ghost'}
                    aria-pressed={on}
                    aria-label={`${s}${on ? ', selected' : ''}`}
                    style={on ? undefined : red}
                    onClick={() => setSizes(on ? sizes.filter((x) => x !== s) : [...sizes, s])}
                  >
                    {s}
                  </button>
                );
              })}
              <input
                aria-label="Other size"
                value={sizeDraft}
                placeholder="Other size"
                maxLength={MAX_SIZE}
                style={{ width: 120 }}
                onChange={(e) => setSizeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setSizes(withDraft(sizes, sizeDraft));
                    setSizeDraft('');
                  }
                }}
              />
            </div>
            {missing ? (
              <span role="alert" style={{ color: 'var(--red-600)', fontSize: 12 }}>
                Add at least one size before saving.
              </span>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="v-colours">
              Colours <FieldTag />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {colours.map((c) => (
                <span
                  key={c}
                  className="btn ghost"
                  style={{
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    cursor: 'default',
                  }}
                >
                  {c}
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                    onClick={() => setColours(colours.filter((x) => x !== c))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="v-colours"
                value={draft}
                placeholder={colours.length ? 'Add another' : 'Red'}
                maxLength={MAX_COLOUR}
                style={{ flex: 1, minWidth: 140 }}
                onChange={(e) => {
                  // A comma commits too, so a pasted "Red, Navy" still splits.
                  const parts = e.target.value.split(',');
                  const last = parts.pop() ?? '';
                  setColours(parts.reduce(withDraft, colours));
                  setDraft(last);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Inside the product form, Enter would otherwise submit it.
                    e.preventDefault();
                    setColours(withDraft(colours, draft));
                    setDraft('');
                  } else if (e.key === 'Backspace' && draft === '' && colours.length) {
                    setColours(colours.slice(0, -1));
                  }
                }}
              />
              <button
                type="button"
                // Blue once there is a colour to add, grey while the box is empty.
                className={draft.trim() === '' ? 'btn ghost' : 'btn blue'}
                disabled={draft.trim() === ''}
                onClick={() => {
                  setColours(withDraft(colours, draft));
                  setDraft('');
                }}
              >
                Add colour
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Press Enter or Add colour after each colour. Each colour gets its own row at this
              price.
            </span>
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}
          >
            <div className="field">
              <label htmlFor="v-price">
                Price (Rs) <FieldTag required />
              </label>
              <input
                id="v-price"
                inputMode="decimal"
                value={price}
                style={red}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
            <button
              className="btn"
              type="button"
              disabled={!canAdd || !(Number(price) > 0) || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending
                ? 'Adding…'
                : sizeList.length === 0
                  ? 'Pick a size'
                  : `Add ${combos.length} option${combos.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : (
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
            <label htmlFor="v-label">
              Option <FieldTag required />
            </label>
            <input
              id="v-label"
              value={label}
              placeholder="500 g"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="v-unit">
              Sold as <FieldTag />
            </label>
            <input
              id="v-unit"
              value={unit}
              placeholder="same as option"
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="v-price">
              Price (Rs) <FieldTag required />
            </label>
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
            disabled={!canAdd || !(Number(price) > 0) || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}

/** A row's price, saved when the field loses focus — only if it changed and is above zero. */
function PriceCell({
  paisa,
  disabled,
  onSave,
}: {
  paisa: number;
  disabled: boolean;
  onSave: (paisa: number) => void;
}) {
  const [value, setValue] = useState(rupees(paisa));
  useEffect(() => setValue(rupees(paisa)), [paisa]);

  return (
    <input
      aria-label="Price in rupees"
      inputMode="decimal"
      style={{ width: 110, textAlign: 'right' }}
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        const next = Number(value) > 0 ? toPaisa(value) : paisa;
        if (next !== paisa) onSave(next);
        else setValue(rupees(paisa));
      }}
    />
  );
}
