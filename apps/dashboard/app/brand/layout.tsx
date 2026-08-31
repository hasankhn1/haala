import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { UserRole } from '@haala/shared';
import { Nav, type NavLink } from '@/components/Nav';
import { API_BASE, readSession } from '@/lib/session';

/**
 * The vendor's shell.
 *
 * Guarded on the **server**, before any markup ships, and on the role rather
 * than the mere existence of a cookie — an ops session must not be able to walk
 * into the brand shell and act as an unnamed tenant, and a downgraded account
 * must not linger in a UI it no longer belongs in.
 *
 * The API is the real boundary: every `/brand/*` call is scoped by the token,
 * so a vendor who got past this guard would still see nothing. This is here so
 * the wrong person gets an honest redirect instead of a working-looking shell
 * full of empty tables.
 */
const BRAND_LINKS: NavLink[] = [
  { href: '/brand', label: 'Overview' },
  { href: '/brand/products', label: 'Products' },
  { href: '/brand/categories', label: 'Categories' },
  { href: '/brand/profile', label: 'Shop details' },
];

export default async function BrandLayout({ children }: { children: ReactNode }) {
  const { accessToken } = readSession();
  if (!accessToken) redirect('/login');

  const [meRes, brandRes] = await Promise.all([
    fetch(`${API_BASE}/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }),
    fetch(`${API_BASE}/brand/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }),
  ]);
  if (!meRes.ok) redirect('/login');

  const me = (await meRes.json()) as { data: { name: string; role: string } };
  if (me.data.role !== UserRole.BrandUser) redirect('/');

  // A brand user always has a brand — `users_brand_role_ck` guarantees it — so
  // a failure here is a real fault rather than a case to render around.
  if (!brandRes.ok) redirect('/login');
  const brand = (await brandRes.json()) as { data: { name: string; status: string } };

  return (
    <div className="shell">
      <Nav
        title={brand.data.name}
        links={BRAND_LINKS}
        name={me.data.name}
        subtitle="Shop owner"
      />
      <main className="main">
        {brand.data.status !== 'active' ? (
          <div className="error-banner">
            {brand.data.status === 'suspended'
              ? 'Your shop is suspended, so customers cannot see your products right now. You can still edit them. Contact Haala to sort it out.'
              : 'Your shop is not live yet. You can set everything up now; Haala will switch it on.'}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
