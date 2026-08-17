import { NextResponse } from 'next/server';
import { API_BASE, readSession } from '@/lib/session';

/** Who is signed in, resolved server-side from the cookie. */
export async function GET() {
  const { accessToken } = readSession();
  if (!accessToken) return NextResponse.json({ ok: false }, { status: 401 });

  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await res.json());
}
