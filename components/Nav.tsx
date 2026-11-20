'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Beranda' },
  { href: '/kalender', label: 'Kalender' },
  { href: '/kuliah', label: 'Kuliah' },
  { href: '/riset', label: 'Riset' },
  { href: '/keuangan', label: 'Keuangan' },
  { href: '/pengaturan', label: 'Pengaturan' },
] as const;

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
      <div className="mb-4 text-lg font-semibold leading-tight">Hub<br />Pribadi<span className="block text-xs font-normal text-muted">kuliah · riset · uang</span></div>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? 'page' : undefined}
          className={`rounded-lg px-3 py-2 text-sm ${isActive(path, i.href) ? 'bg-accent text-accent-ink' : 'hover:bg-surface'}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.filter((i) => i.href !== '/pengaturan').map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? 'page' : undefined}
          className={`px-1 py-3 text-center text-xs ${isActive(path, i.href) ? 'font-semibold text-accent' : 'text-muted'}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
