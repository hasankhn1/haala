'use client';

import type { AttributeField, BusinessTypeKey } from '@haala/shared';
import { businessTypeSpecs, isBusinessTypeKey } from '@haala/shared';

/**
 * The part of the product form that depends on what kind of shop this is.
 *
 * A bakery is asked for ingredients and shelf life; a clothing brand for fabric
 * and care. Neither field list is written here — both come from
 * `businessTypeSpecs`, the same registry the API validates against, so the form
 * and the validator cannot disagree about what a bakery product is.
 *
 * Adding a business type therefore touches one file in `@haala/shared` and this
 * component renders it without being edited.
 */
export type Attributes = Record<string, unknown>;

export function TypedProductFields({
  typeKey,
  value,
  onChange,
}: {
  typeKey: string;
  value: Attributes;
  onChange: (next: Attributes) => void;
}) {
  if (!isBusinessTypeKey(typeKey)) {
    return (
      <div className="error-banner">
        This shop’s business type has no product fields defined yet. Haala needs to finish setting
        it up before these can be filled in.
      </div>
    );
  }

  const spec = businessTypeSpecs[typeKey as BusinessTypeKey];
  if (spec.fields.length === 0) return null;

  const set = (key: string, next: unknown) => {
    const merged = { ...value };
    // An empty field means "not stated", which is absence rather than a stored
    // empty string — the schemas treat every one of these as optional.
    if (next === undefined || next === '' || (Array.isArray(next) && next.length === 0)) {
      delete merged[key];
    } else {
      merged[key] = next;
    }
    onChange(merged);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <h2>{spec.name} details</h2>
      {spec.fields.map((f) => (
        <AttributeInput key={f.key} field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
    </div>
  );
}

function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const id = `attr-${field.key}`;

  if (field.kind === 'boolean') {
    return (
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked ? true : undefined)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}
        {field.suffix ? <span className="muted"> ({field.suffix})</span> : null}
      </label>

      {field.kind === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === 'number' ? (
        <input
          id={id}
          inputMode="numeric"
          value={typeof value === 'number' ? String(value) : ''}
          placeholder={field.placeholder}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '');
            // The schema wants a number or nothing; an empty box is nothing,
            // not zero, which would claim a shelf life of no days.
            onChange(digits === '' ? undefined : Number(digits));
          }}
        />
      ) : field.kind === 'tags' ? (
        <input
          id={id}
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          placeholder="Flour, butter, sugar"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      ) : (
        <input
          id={id}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.help ? (
        <span className="muted" style={{ fontSize: 12 }}>
          {field.help}
        </span>
      ) : null}
    </div>
  );
}
