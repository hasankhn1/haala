'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type { AdminBannerView, BusinessTypeView, DepartmentView } from '@haala/shared';
import { ImageUploader } from '@/components/ImageUploader';
import { ApiError, api } from '@/lib/api';

/**
 * The customer homepage, as far as it is editable.
 *
 * **Banners only, on purpose.** The two switches people ask for next —
 * "turn off a department", "turn off a shop" — already exist, on Business types
 * and Brands respectively, and a second control for either would be a second
 * place for them to disagree. So this page links across to them instead of
 * reimplementing them.
 *
 * What is genuinely new is the promo row: artwork, a caption, which department
 * it belongs to, what order they sit in, and whether each is showing. Every save
 * clears the cached home payload server-side, so the app agrees with this screen
 * as soon as the row stops saying "Saving…".
 *
 * Two behaviours here are worth knowing because they are not obvious from the
 * form. A banner attached to a department that is not live is **withheld from
 * the app** — a promo that opens onto an empty shelf is worse than no promo —
 * and the row says so rather than letting somebody wonder why their banner never
 * appeared. And the image is stored as an object key rather than a URL, so
 * moving buckets or putting a CDN in front does not mean rewriting every row.
 */
const ALL_DEPARTMENTS = '';

export default function HomepagePage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: '',
    badge: '',
    departmentKey: ALL_DEPARTMENTS,
    linkTo: '',
    imageKey: '',
    imageUrl: '',
  });

  const banners = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<AdminBannerView[]>('/admin/banners'),
  });

  const types = useQuery({
    queryKey: ['admin', 'business-types'],
    queryFn: () => api.get<BusinessTypeView[]>('/admin/business-types'),
  });

  /**
   * The same liveness the app computes, from the same endpoint the app calls.
   *
   * Not `businessTypes.isActive`, which is a different question. "Offered" means
   * ops is willing to sell the department; "live" means there is stock in it,
   * and the API withholds a banner on the second. Bakery today is offered and
   * empty — warning on the first signal alone would tell an editor their bakery
   * banner is fine while the app quietly refuses to draw it.
   */
  const live = useQuery({
    queryKey: ['catalog', 'departments'],
    queryFn: () => api.get<DepartmentView[]>('/catalog/departments'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : 'That did not work');

  const create = useMutation({
    mutationFn: () =>
      api.post<AdminBannerView>('/admin/banners', {
        title: draft.title.trim(),
        // Empty strings are meaningless to the API and would render as blank
        // pills in the app; send null and let the column be nullable.
        badge: draft.badge.trim() || null,
        departmentKey: draft.departmentKey || null,
        linkTo: draft.linkTo.trim() || null,
        imageKey: draft.imageKey || null,
        // One past the highest, not `rows.length` — the existing numbers need
        // not be a clean run, and reusing one puts the new banner in an
        // arbitrary place among its equals.
        sortOrder: rows.reduce((max, b) => Math.max(max, b.sortOrder + 1), 0),
      }),
    onSuccess: () => {
      setDraft({
        title: '',
        badge: '',
        departmentKey: ALL_DEPARTMENTS,
        linkTo: '',
        imageKey: '',
        imageUrl: '',
      });
      setError(null);
      invalidate();
    },
    onError,
  });

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<AdminBannerView>) =>
      api.patch<AdminBannerView>(`/admin/banners/${id}`, body),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/banners/${id}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const rows = banners.data ?? [];
  const departments = types.data ?? [];
  const liveKeys = new Set((live.data ?? []).filter((d) => d.isLive).map((d) => d.key));
  const nameFor = (key: string | null) =>
    key === null ? 'All departments' : (departments.find((t) => t.key === key)?.name ?? key);

  /**
   * Move a banner one place, by renumbering positions rather than swapping the
   * two rows' `sortOrder` values.
   *
   * Swapping is the obvious implementation and it is wrong: nothing guarantees
   * the numbers are distinct. Two banners created a moment apart both land on
   * the same `sortOrder`, and swapping equal values leaves the list exactly as
   * it was — the arrow appears to do nothing, which reads as a broken button
   * rather than as duplicate data. Assigning each row its index repairs
   * duplicates and gaps as a side effect.
   */
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const target = next[index];
    const neighbour = next[index + by];
    if (!target || !neighbour) return;
    next[index] = neighbour;
    next[index + by] = target;

    next.forEach((b, i) => {
      if (b.sortOrder !== i) patch.mutate({ id: b.id, sortOrder: i });
    });
  };

  const canSubmit = draft.title.trim().length >= 2 && !create.isPending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Homepage</h1>
          <p>The promo cards on the customer home screen, and where the other switches live.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>The rest of the homepage</h2>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
          Departments and shops are switched on and off where they are defined, so there is one
          answer rather than two.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn ghost" href="/business-types">
            Departments →
          </Link>
          <Link className="btn ghost" href="/brands">
            Shops →
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) 1fr', gap: 24 }}>
        <form
          className="card"
          style={{ display: 'grid', gap: 14, alignSelf: 'start' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 style={{ marginTop: 0 }}>New banner</h2>

          <div className="field">
            <label htmlFor="title">Caption</label>
            <input
              id="title"
              value={draft.title}
              placeholder="Free delivery on your first order"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="badge">Badge</label>
            <input
              id="badge"
              value={draft.badge}
              placeholder="LAUNCH OFFER"
              onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Optional. A short pill over the artwork — a few words at most.
            </span>
          </div>

          <div className="field">
            <label htmlFor="dept">Department</label>
            <select
              id="dept"
              value={draft.departmentKey}
              onChange={(e) => setDraft({ ...draft, departmentKey: e.target.value })}
            >
              <option value={ALL_DEPARTMENTS}>All departments</option>
              {departments.map((t) => (
                <option key={t.id} value={t.key} disabled={!t.isActive}>
                  {t.name}
                  {t.isActive ? '' : ' — not offered'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="link">Opens</label>
            <input
              id="link"
              value={draft.linkTo}
              placeholder="/department/grocery"
              onChange={(e) => setDraft({ ...draft, linkTo: e.target.value })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Optional. Leave empty and the card is not tappable.
            </span>
          </div>

          <ImageUploader
            kind="home-banner"
            label="Artwork"
            hint="Wide and short — it is drawn at roughly 290×104."
            value={draft.imageUrl}
            onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
            onKeyChange={(key) => setDraft((d) => ({ ...d, imageKey: key }))}
          />

          <button className="btn" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Adding…' : 'Add banner'}
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Artwork</th>
                <th>Caption</th>
                <th>Department</th>
                <th style={{ width: 90 }}>Order</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => {
                const withheld = b.isActive && b.departmentKey !== null && !liveKeys.has(b.departmentKey);
                return (
                  <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.55 }}>
                    <td>
                      {b.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.imageUrl}
                          alt=""
                          style={{ width: 104, height: 38, objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          no image
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{b.title}</strong>
                      {b.badge ? (
                        <span className="badge neutral" style={{ marginLeft: 8 }}>
                          {b.badge}
                        </span>
                      ) : null}
                      {b.isActive ? null : (
                        <span className="badge neutral" style={{ marginLeft: 8 }}>
                          off
                        </span>
                      )}
                      {withheld ? (
                        <div className="badge bad" style={{ marginTop: 6 }}>
                          held back — nothing is in stock in {nameFor(b.departmentKey)} yet
                        </div>
                      ) : null}
                      {b.linkTo ? (
                        <div
                          className="muted"
                          style={{
                            fontSize: 12,
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 220,
                          }}
                          title={b.linkTo}
                        >
                          <code>{b.linkTo}</code>
                        </div>
                      ) : null}
                    </td>
                    <td className="muted">{nameFor(b.departmentKey)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn ghost"
                          type="button"
                          aria-label={`Move ${b.title} up`}
                          disabled={i === 0 || patch.isPending}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          aria-label={`Move ${b.title} down`}
                          disabled={i === rows.length - 1 || patch.isPending}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          justifyContent: 'flex-end',
                          // Without this "Turn off" wraps onto two lines and
                          // shoulders Delete off the right edge of the table.
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={patch.isPending}
                          onClick={() => patch.mutate({ id: b.id, isActive: !b.isActive })}
                        >
                          {b.isActive ? 'Turn off' : 'Turn on'}
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => {
                            // Deleting artwork is not undoable and the row is
                            // one click from being merely switched off instead.
                            if (confirm(`Delete “${b.title}”? Turning it off keeps it for later.`)) {
                              remove.mutate(b.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {banners.isLoading ? <div className="empty">Loading…</div> : null}
          {!banners.isLoading && rows.length === 0 ? (
            <div className="empty">
              No banners yet. The promo row is hidden in the app until there is one.
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
