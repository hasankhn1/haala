'use client';

import { useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';

/**
 * Pick a photo, and have it end up in the catalogue.
 *
 * The file is **shrunk in the browser before it is sent**. A phone photo is
 * 4–8MB and 4000px wide; a product card shows it at 150px. Resizing here rather
 * than on the server means a vendor on a Peshawar mobile connection uploads
 * ~200KB instead of eight megabytes, and no server CPU is spent on it.
 *
 * The upload itself goes straight to Cloudflare, not through the API — the
 * three-step dance below (sign, PUT, confirm) exists so a large file never
 * touches our own bandwidth, while the size limit still gets enforced by
 * someone we control.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image'))),
      'image/jpeg',
      QUALITY,
    );
  });
}

/**
 * Which namespace the file lands in, and therefore which endpoints sign it.
 *
 * `home-banner` is the odd one out: everything else is a brand's asset and goes
 * through `/uploads/*`, which resolves a tenant from the session. A homepage
 * banner belongs to the platform and has no tenant, so it is signed by the
 * super-admin route instead. Same three steps, different door.
 */
const ENDPOINTS = {
  brandScoped: { sign: '/uploads/sign', confirm: '/uploads/confirm' },
  home: { sign: '/admin/banners/uploads/sign', confirm: '/admin/banners/uploads/confirm' },
} as const;

export function ImageUploader({
  kind,
  value,
  onChange,
  onKeyChange,
  label,
  hint,
}: {
  kind: 'products' | 'categories' | 'brand' | 'home-banner';
  value: string;
  onChange: (url: string) => void;
  /**
   * The object key, when the caller stores that rather than the URL. Banners
   * do: a key survives moving buckets or putting a CDN in front, where a
   * baked-in absolute URL would have to be rewritten across every row.
   */
  onKeyChange?: (key: string) => void;
  label: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await downscale(file);

      const routes = kind === 'home-banner' ? ENDPOINTS.home : ENDPOINTS.brandScoped;

      const signed = await api.post<{ key: string; uploadUrl: string }>(routes.sign, {
        // The home route has no `kind` — its prefix is fixed — and rejects
        // unknown keys, so it must not be sent one.
        ...(kind === 'home-banner' ? {} : { kind }),
        contentType: 'image/jpeg',
      });

      // Straight to Cloudflare. `api` is not used here on purpose — this request
      // must not carry our session, and must not go through the proxy.
      const put = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const done = await api.post<{ url: string }>(routes.confirm, { key: signed.key });
      onChange(done.url);
      onKeyChange?.(signed.key);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not upload that photo',
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="field">
      <span className="metric-label">{label}</span>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--muted)',
            overflow: 'hidden',
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span className="muted" style={{ fontSize: 11 }}>
              No photo
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'Uploading…' : value ? 'Replace photo' : 'Choose a photo'}
            </button>
            {value ? (
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  onChange('');
                  // Clear the key too. Dropping only the preview would leave the
                  // row pointing at the old object — a "removed" image that comes
                  // back on the next reload.
                  onKeyChange?.('');
                }}
              >
                Remove
              </button>
            ) : null}
          </div>

          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <span className="muted" style={{ fontSize: 12 }}>
            {hint ?? 'JPG, PNG or WebP. Large photos are shrunk automatically.'}
          </span>

          {/*
            A pasted link still works for a vendor's own photos, which are stored
            as URLs. It is withheld where the caller stores a **key**: there is no
            key to derive from somebody else's URL, so pasting one would set a
            preview here, save `imageKey: null`, and show an image in the dashboard
            that never reaches the app.
          */}
          {onKeyChange ? null : (
            <input
              value={value}
              placeholder="…or paste a link"
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${label} link`}
            />
          )}
        </div>
      </div>

      {error ? (
        <div className="error-banner" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
