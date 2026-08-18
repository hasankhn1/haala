'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { formatPKR, type PromotionType, type PromotionView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Promotions.
 *
 * Codes are money, so this page is deliberately conservative: a code's type and
 * value are fixed after creation (orders already reference the code, and
 * changing what it means would silently rewrite what past receipts imply), and
 * codes are deactivated rather than deleted. Limits and the end date stay
 * editable — those are the levers you actually want mid-campaign.
 */
interface FormState {
  code: string;
  type: PromotionType;
  /** Percent for `percentage`; rupees for `fixed_amount` — converted to paisa on submit. */
  value: string;
  minOrderTotal: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  endsAt: string;
}

const EMPTY: FormState = {
  code: '',
  type: 'free_delivery',
  value: '',
  minOrderTotal: '',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: '1',
  endsAt: '',
};

/** Rupee text field → paisa, or null when blank. */
const paisa = (rupeeText: string): number | null => {
  const n = Number(rupeeText);
  return rupeeText.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
};

const int = (text: string): number | null => {
  const n = Number(text);
  return text.trim() === '' || !Number.isFinite(n) ? null : Math.trunc(n);
};

const TYPE_LABEL: Record<PromotionType, string> = {
  free_delivery: 'Free delivery',
  percentage: 'Percentage off',
  fixed_amount: 'Fixed amount off',
};

const describe = (p: PromotionView): string => {
  if (p.type === 'free_delivery') return 'Delivery fee waived';
  if (p.type === 'percentage') {
    return p.maxDiscount === null
      ? `${p.value}% off`
      : `${p.value}% off, capped at ${formatPKR(p.maxDiscount)}`;
  }
  return `${formatPKR(p.value)} off`;
};

export default function PromotionsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const promos = useQuery({
    queryKey: ['ops', 'promotions'],
    queryFn: () => api.get<PromotionView[]>('/promotions/all'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ops', 'promotions'] });
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Could not save the promotion');

  const create = useMutation({
    mutationFn: () => {
      const isPercent = form.type === 'percentage';
      return api.post<PromotionView>('/promotions', {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        // Percentages are a plain number; fixed amounts are money, so paisa.
        value:
          form.type === 'free_delivery'
            ? 0
            : isPercent
              ? (int(form.value) ?? 0)
              : (paisa(form.value) ?? 0),
        minOrderTotal: paisa(form.minOrderTotal),
        maxDiscount: paisa(form.maxDiscount),
        usageLimit: int(form.usageLimit),
        perUserLimit: int(form.perUserLimit),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        isActive: true,
      });
    },
    onSuccess: () => {
      setError(null);
      setForm(EMPTY);
      invalidate();
    },
    onError,
  });

  const toggleActive = useMutation({
    mutationFn: (p: PromotionView) =>
      api.patch<PromotionView>(`/promotions/${p.id}`, { isActive: !p.isActive }),
    onSuccess: invalidate,
    onError,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const needsValue = form.type !== 'free_delivery';
  const valueOk =
    !needsValue ||
    (form.type === 'percentage'
      ? Number(form.value) >= 1 && Number(form.value) <= 100
      : Number(form.value) >= 1);
  const canSubmit =
    /^[A-Z0-9_-]{3,32}$/.test(form.code.trim().toUpperCase()) && valueOk && !create.isPending;

  const rows = promos.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Promotions</h1>
          <p>
            Discount codes. A code&apos;s type and value are fixed once created — limits and the end
            date stay editable.
          </p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 24 }}>
        <form
          className="card"
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}
        >
          <h2>New promotion</h2>

          <Field label="Code" id="code">
            <input
              id="code"
              value={form.code}
              placeholder="HAALA100"
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Letters, numbers, - and _ . Customers can type it in any case.
            </span>
          </Field>

          <Field label="Type" id="type">
            <select
              id="type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}
            >
              <option value="free_delivery">Free delivery</option>
              <option value="percentage">Percentage off</option>
              <option value="fixed_amount">Fixed amount off</option>
            </select>
          </Field>

          {needsValue ? (
            <Field
              label={form.type === 'percentage' ? 'Percent off (1–100)' : 'Amount off (Rs)'}
              id="value"
            >
              <input
                id="value"
                value={form.value}
                inputMode="numeric"
                placeholder={form.type === 'percentage' ? '10' : '200'}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </Field>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Min spend (Rs)" id="min">
              <input
                id="min"
                value={form.minOrderTotal}
                inputMode="numeric"
                placeholder="any"
                onChange={(e) => setForm({ ...form, minOrderTotal: e.target.value })}
              />
            </Field>
            {form.type === 'percentage' ? (
              <Field label="Max discount (Rs)" id="max">
                <input
                  id="max"
                  value={form.maxDiscount}
                  inputMode="numeric"
                  placeholder="no cap"
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                />
              </Field>
            ) : (
              <div />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Total uses" id="limit">
              <input
                id="limit"
                value={form.usageLimit}
                inputMode="numeric"
                placeholder="unlimited"
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              />
            </Field>
            <Field label="Per customer" id="peruser">
              <input
                id="peruser"
                value={form.perUserLimit}
                inputMode="numeric"
                placeholder="unlimited"
                onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Ends" id="ends">
            <input
              id="ends"
              type="date"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </Field>

          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create promotion'}
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Conditions</th>
                <th className="num">Used</th>
                <th>State</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {promos.isLoading ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No promotions yet — create the first one.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const expired = p.endsAt !== null && new Date(p.endsAt) < new Date();
                  const exhausted = p.usageLimit !== null && p.usedCount >= p.usageLimit;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                          {p.code}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {TYPE_LABEL[p.type]}
                        </div>
                      </td>
                      <td>{describe(p)}</td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {p.minOrderTotal !== null
                            ? `Min ${formatPKR(p.minOrderTotal)}`
                            : 'No minimum'}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {p.perUserLimit !== null
                            ? `${p.perUserLimit} per customer`
                            : 'Unlimited per customer'}
                          {p.endsAt ? ` · ends ${new Date(p.endsAt).toLocaleDateString()}` : ''}
                        </div>
                      </td>
                      <td className="num">
                        {p.usedCount}
                        {p.usageLimit !== null ? ` / ${p.usageLimit}` : ''}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            !p.isActive || expired || exhausted ? 'neutral' : 'good'
                          }`}
                        >
                          {!p.isActive
                            ? 'Paused'
                            : expired
                              ? 'Expired'
                              : exhausted
                                ? 'Claimed out'
                                : 'Live'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn ghost sm"
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(p)}
                        >
                          {p.isActive ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
