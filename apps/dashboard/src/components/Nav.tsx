'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/orders', label: 'Orders' },
  { href: '/riders', label: 'Riders' },
  { href: '/catalog', label: 'Catalogue' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/stores', label: 'Stores' },
  { href: '/staff', label: 'Staff' },
];

export function Nav({ name, phone }: { name: string; phone: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <nav className="sidebar">
      <div className="brand">Haala Ops</div>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname.startsWith(l.href) ? 'page' : undefined}
        >
          {l.label}
        </Link>
      ))}
      <div className="spacer" />
      <div className="who">
        <div style={{ color: '#fff', fontWeight: 600 }}>{name}</div>
        <div>{phone}</div>
      </div>
      <button className="btn ghost" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={signOut}>
        Sign out
      </button>
    </nav>
  );
}
