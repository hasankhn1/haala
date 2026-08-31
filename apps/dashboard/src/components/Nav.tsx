'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
}

/**
 * The sidebar, shared by both shells.
 *
 * Ops and a vendor see entirely different menus, but the same chrome — one
 * component taking its links rather than two that drift apart. `title` is what
 * distinguishes them at a glance: a vendor should never be in any doubt that
 * they are looking at their own shop and not the platform.
 */
export function Nav({
  title,
  links,
  name,
  subtitle,
}: {
  title: string;
  links: NavLink[];
  name: string;
  subtitle: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <nav className="sidebar">
      <div className="brand">{title}</div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          // Exact match for the shell root, so "/brand" is not marked current
          // on every page beneath it.
          aria-current={
            (l.href === pathname || (l.href !== '/brand' && pathname.startsWith(l.href))) &&
            'page'
          }
        >
          {l.label}
        </Link>
      ))}
      <div className="spacer" />
      <div className="who">
        <div style={{ color: '#fff', fontWeight: 600 }}>{name}</div>
        <div>{subtitle}</div>
      </div>
      <button className="btn ghost" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={signOut}>
        Sign out
      </button>
    </nav>
  );
}
