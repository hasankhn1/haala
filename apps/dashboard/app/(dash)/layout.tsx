import { redirect } from 'next/navigation';
import { HAALA_STAFF_ROLES } from '@haala/shared';
import type { ReactNode } from 'react';
import { API_BASE, readSession } from '@/lib/session';
import { Nav } from '@/components/Nav';

/**
 * Authenticated shell.
 *
 * The guard runs on the **server**, before any markup ships — an unauthenticated
 * visitor is redirected rather than briefly seeing an ops screen. It also
 * verifies the role rather than trusting the cookie's existence, so a stale or
 * downgraded session can't linger in the UI.
 */
export default async function DashLayout({ children }: { children: ReactNode }) {
  const { accessToken } = readSession();
  if (!accessToken) redirect('/login');

  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) redirect('/login');

  const json = (await res.json()) as { data: { name: string; role: string; phone: string } };
  // Both Haala staff roles. Migration 0007 promoted the existing ops account to
  // `super_admin`, and `admin` stays valid for staff who don't manage brands.
  if (!HAALA_STAFF_ROLES.includes(json.data.role as (typeof HAALA_STAFF_ROLES)[number])) {
    redirect('/login');
  }

  return (
    <div className="shell">
      <Nav name={json.data.name} phone={json.data.phone} />
      <main className="main">{children}</main>
    </div>
  );
}
