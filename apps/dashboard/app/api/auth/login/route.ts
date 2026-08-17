import { NextResponse, type NextRequest } from 'next/server';
import { UserRole, type AuthResult } from '@haala/shared';
import { API_BASE, setSession } from '@/lib/session';

/**
 * Sign in to the dashboard.
 *
 * Rejects anyone who isn't an admin *before* setting a cookie. The API would
 * reject them on every ops route anyway, but failing here gives an honest
 * message instead of a working login followed by a wall of 403s.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
  });

  const json = (await res.json()) as {
    ok: boolean;
    data?: AuthResult;
    error?: { message: string };
  };
  if (!res.ok || !json.ok || !json.data) {
    return NextResponse.json(
      { ok: false, error: { message: json.error?.message ?? 'Could not sign in' } },
      { status: res.status },
    );
  }

  if (json.data.user.role !== UserRole.Admin) {
    return NextResponse.json(
      { ok: false, error: { message: 'This account does not have operations access' } },
      { status: 403 },
    );
  }

  setSession(json.data.tokens);
  return NextResponse.json({ ok: true, data: json.data.user });
}
