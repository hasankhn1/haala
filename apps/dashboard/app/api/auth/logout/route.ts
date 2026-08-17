import { NextResponse } from 'next/server';
import { API_BASE, clearSession, readSession } from '@/lib/session';

export async function POST() {
  const { refreshToken } = readSession();
  // Best-effort server-side revocation; the cookie is cleared either way.
  if (refreshToken) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  clearSession();
  return NextResponse.json({ ok: true });
}
