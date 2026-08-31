'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import type { BrandProfileView } from '@haala/shared';
import { ApiError, api } from '@/lib/api';

/**
 * The shop's own details.
 *
 * A vendor edits how they are presented — the blurb, the logo, how to reach
 * them. Not their name, their web address, their business type or their status:
 * those are Haala's, and changing any of them is a decision rather than an edit.
 * A shop renaming itself would break links customers already hold; a shop
 * lifting its own suspension would make suspension meaningless.
 *
 * They are shown here anyway, greyed, so the answer to "why can't I change my
 * name?" is on the screen instead of in a support message.
 */
export default function BrandProfilePage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    description: '',
    logoUrl: '',
    coverUrl: '',
    contactPhone: '',
    contactEmail: '',
  });

  const profile = useQuery({
    queryKey: ['brand', 'profile'],
    queryFn: () => api.get<BrandProfileView>('/brand/profile'),
  });

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      description: p.description ?? '',
      logoUrl: p.logoUrl ?? '',
      coverUrl: p.coverUrl ?? '',
      contactPhone: p.contactPhone ?? '',
      contactEmail: p.contactEmail ?? '',
    });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<BrandProfileView>('/brand/profile', {
        description: form.description.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        coverUrl: form.coverUrl.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['brand', 'profile'] });
    },
    onError: (e: unknown) => {
      setSaved(false);
      setError(e instanceof ApiError ? e.message : 'Could not save');
    },
  });

  const p = profile.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shop details</h1>
          <p>How your shop appears to customers.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {saved && !error ? (
        <div className="card" style={{ padding: 12 }}>
          Saved.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 320px', gap: 24 }}>
        <form
          className="card"
          style={{ display: 'grid', gap: 14 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2>Yours to change</h2>

          <div className="field">
            <label htmlFor="s-desc">About the shop</label>
            <textarea
              id="s-desc"
              rows={4}
              value={form.description}
              placeholder="Home baking in DHA Phase 5, made to order."
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="s-logo">Logo link</label>
            <input
              id="s-logo"
              value={form.logoUrl}
              placeholder="https://…"
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="s-cover">Cover photo link</label>
            <input
              id="s-cover"
              value={form.coverUrl}
              placeholder="https://…"
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Paste links for now — uploading straight from your phone is coming.
            </span>
          </div>

          <div className="field">
            <label htmlFor="s-phone">Contact phone</label>
            <input
              id="s-phone"
              value={form.contactPhone}
              placeholder="+923001234567"
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="s-email">Contact email</label>
            <input
              id="s-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </div>

          <button className="btn" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </form>

        <div className="card" style={{ alignSelf: 'start' }}>
          <h2>Set by Haala</h2>
          <p className="muted">Ask us if any of these need to change.</p>
          <dl style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            <Fixed label="Shop name" value={p?.name} />
            <Fixed label="Web address" value={p ? `haala.pk/${p.slug}` : undefined} />
            <Fixed label="Business type" value={p?.businessType.name} />
            <Fixed label="Status" value={p?.status} />
          </dl>
        </div>
      </div>
    </>
  );
}

function Fixed({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="metric-label">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value ?? '—'}</dd>
    </div>
  );
}
