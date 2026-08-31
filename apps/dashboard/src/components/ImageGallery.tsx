'use client';

import { useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';

/**
 * A product's photos.
 *
 * One picture sells a bag of flour; it does not sell a suit. A boutique needs
 * the front, the back and a close-up of the fabric, so this takes several at
 * once and keeps the order the vendor puts them in.
 *
 * **The first photo is the cover** — the one on the card — and that is stated
 * on the tile rather than left to be discovered. Reordering is how you change
 * it, which is fewer concepts than a separate "make this the cover" action.
 *
 * Each file is shrunk in the browser and uploaded straight to Cloudflare; see
 * `ImageUploader` for why. Uploads run one after another rather than at once,
 * so a vendor picking eight photos on a phone connection does not open eight
 * simultaneous requests and time all of them out.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;
const MAX_IMAGES = 12;

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

async function uploadOne(file: File): Promise<string> {
  const blob = await downscale(file);
  const signed = await api.post<{ key: string; uploadUrl: string }>('/uploads/sign', {
    kind: 'products',
    contentType: 'image/jpeg',
  });
  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  const done = await api.post<{ url: string }>('/uploads/confirm', { key: signed.key });
  return done.url;
}

export function ImageGallery({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: File[]) => {
    const room = MAX_IMAGES - value.length;
    if (room <= 0) {
      setError(`That is the limit of ${MAX_IMAGES} photos. Remove one to add another.`);
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > room) {
      setError(`Only ${room} more will fit, so the first ${room} were taken.`);
    } else {
      setError(null);
    }

    setProgress({ done: 0, total: batch.length });
    const added: string[] = [];
    try {
      // Sequential on purpose — see the note above.
      for (const [i, file] of batch.entries()) {
        added.push(await uploadOne(file));
        setProgress({ done: i + 1, total: batch.length });
      }
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed',
      );
    } finally {
      // Whatever got through is kept. Losing four successful uploads because
      // the fifth failed would be its own small betrayal.
      if (added.length) onChange([...value, ...added]);
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const move = (from: number, by: number) => {
    const to = from + by;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange(next);
  };

  const remove = (i: number) => onChange(value.filter((_, n) => n !== i));

  return (
    <div className="field">
      <span className="metric-label">{label}</span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        {value.map((url, i) => (
          <figure
            key={url}
            style={{
              margin: 0,
              width: 116,
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--muted)',
            }}
          >
            <div style={{ position: 'relative', height: 116 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {i === 0 ? (
                <span
                  className="badge dark"
                  style={{ position: 'absolute', left: 6, top: 6, fontSize: 10 }}
                >
                  Cover
                </span>
              ) : null}
            </div>
            <figcaption
              style={{ display: 'flex', gap: 2, padding: 4, justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', gap: 2 }}>
                <button
                  className="btn ghost"
                  type="button"
                  aria-label="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ←
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  aria-label="Move later"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                >
                  →
                </button>
              </span>
              <button
                className="btn ghost"
                type="button"
                aria-label="Remove this photo"
                onClick={() => remove(i)}
              >
                ✕
              </button>
            </figcaption>
          </figure>
        ))}

        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null || value.length >= MAX_IMAGES}
          style={{
            width: 116,
            height: 148,
            borderRadius: 10,
            border: '1px dashed var(--border-strong, var(--border))',
            background: 'transparent',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            padding: 8,
            color: 'inherit',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : '+ Add photos'}
          </span>
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void addFiles(files);
        }}
      />

      <span className="muted" style={{ fontSize: 12 }}>
        {value.length === 0
          ? 'The first photo becomes the one customers see on the shop page.'
          : `${value.length} of ${MAX_IMAGES}. Drag order with the arrows — the first is the cover.`}
      </span>

      {error ? (
        <div className="error-banner" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
