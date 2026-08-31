import { NextResponse, type NextRequest } from 'next/server';
import { HAALA_STAFF_ROLES, UserRole, type AuthResult } from '@haala/shared';
import { API_BASE, setSession } from '@/lib/session';

/**
 * Sign in to the dashboard.
 *
 * Rejects anyone who isn't Haala staff *before* setting a cookie. The API would
 * reject them on every ops route anyway, but failing here gives an honest
 * message instead of a working login followed by a wall of 403s.
 *
 * Two audiences now share this door: Haala staff, who land on the ops shell,
 * and brand users, who land on their own. Customers and riders are turned away
 * here rather than after a wall of 403s.
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

  const role = json.data.user.role;
  const isStaff = HAALA_STAFF_ROLES.includes(role as (typeof HAALA_STAFF_ROLES)[number]);
  if (!isStaff && role !== UserRole.BrandUser) {
    return NextResponse.json(
      { ok: false, error: { message: 'This account cannot sign in here' } },
      { status: 403 },
    );
  }

  setSession(json.data.tokens);
  return NextResponse.json({ ok: true, data: json.data.user });
}
