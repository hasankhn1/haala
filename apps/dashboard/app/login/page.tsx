'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const COUNTRY_CODE = '+92';

export default function LoginPage() {
  const router = useRouter();
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `${COUNTRY_CODE}${national}`, password }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message ?? 'Could not sign in');
        return;
      }
      router.replace('/orders');
      router.refresh();
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div>
          <h1>Haala Ops</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Operations dashboard
          </p>
        </div>

        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                padding: '9px 12px',
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
              }}
            >
              {COUNTRY_CODE}
            </span>
            <input
              id="phone"
              inputMode="numeric"
              placeholder="300 1234567"
              value={national}
              onChange={(e) => setNational(e.target.value.replace(/\D/g, '').slice(0, 10))}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <button
          className="btn"
          type="submit"
          disabled={loading || national.length < 10 || !password}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Admin accounts only. Riders use the Haala Rider app.
        </p>
      </form>
    </div>
  );
}
