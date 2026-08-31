import { redirect } from 'next/navigation';
import { UserRole } from '@haala/shared';
import { API_BASE, readSession } from '@/lib/session';

/**
 * Two dashboards share one host, so the landing path depends on who signed in.
 * Resolved from the API rather than from the cookie, because the cookie says
 * only that a session exists — not whose.
 */
export default async function Index() {
  const { accessToken } = readSession();
  if (!accessToken) redirect('/login');

  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) redirect('/login');

  const json = (await res.json()) as { data: { role: string } };
  redirect(json.data.role === UserRole.BrandUser ? '/brand' : '/dashboard');
}
