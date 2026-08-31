import { redirect } from 'next/navigation';
import { HAALA_STAFF_ROLES } from '@haala/shared';
import type { ReactNode } from 'react';
import { API_BASE, readSession } from '@/lib/session';
import { Nav, type NavLink } from '@/components/Nav';

/**
 * Authenticated shell.
 *
 * The guard runs on the **server**, before any markup ships — an unauthenticated
 * visitor is redirected rather than briefly seeing an ops screen. It also
 * verifies the role rather than trusting the cookie's existence, so a stale or
 * downgraded session can't linger in the UI.
 */
const OPS_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/brands', label: 'Brands' },
  { href: '/orders', label: 'Orders' },
  { href: '/riders', label: 'Riders' },
  { href: '/catalog', label: 'Catalogue' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/stores', label: 'Stores' },
  { href: '/staff', label: 'Staff' },
  { href: '/business-types', label: 'Business types' },
];

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
  //
  // Someone signed in but in the wrong shell goes to `/`, which routes by role.
  // Sending them to `/login` would show a sign-in form to a person who is
  // already signed in — the one page guaranteed not to help.
  if (!HAALA_STAFF_ROLES.includes(json.data.role as (typeof HAALA_STAFF_ROLES)[number])) {
    redirect('/');
  }

  return (
    <div className="shell">
      <Nav title="Haala Ops" links={OPS_LINKS} name={json.data.name} subtitle={json.data.phone} />
      <main className="main">{children}</main>
    </div>
  );
}
