'use client';
import { CalendarDays, FlaskConical, GraduationCap, Home, Languages, Settings, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KompasLogo } from '@/components/ui/KompasMark';

const ITEMS = [
  { href: '/', label: 'Beranda', icon: Home },
  { href: '/keuangan', label: 'Keuangan', icon: Wallet },
  { href: '/kuliah', label: 'Kuliah', icon: GraduationCap },
  { href: '/riset', label: 'Riset', icon: FlaskConical },
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/bahasa', label: 'Bahasa', icon: Languages },
  { href: '/otomasi', label: 'Otomasi', icon: Zap },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings, also: ['/saya'] },
];

const active = (path: string, href: string, also: string[] = []) =>
  href === '/' ? path === '/' : [href, ...also].some((h) => path === h || path.startsWith(h + '/'));

/** Sidebar laptop 240 px (DESIGN 5.2). */
export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="mb-6 flex min-h-11 items-center px-2" aria-label="Kompas, ke Beranda"><KompasLogo /></Link>
      {ITEMS.map(({ href, label, icon: Icon, also }) => {
        const on = active(path, href, also);
        return (
          <Link key={href} href={href} aria-current={on ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] ${on ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-fg hover:bg-bg'}`}>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
