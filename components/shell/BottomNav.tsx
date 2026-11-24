'use client';
import { CalendarDays, Home, User, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRa } from '@/components/providers/RaProvider';
import { RaMark } from '@/components/ra/RaMark';

type Slot = { href: string; label: string; icon: LucideIcon; match: string[] };
const LEFT: Slot[] = [
  { href: '/', label: 'Beranda', icon: Home, match: [] },
  { href: '/keuangan', label: 'Uang', icon: Wallet, match: ['/keuangan'] },
];
const RIGHT: Slot[] = [
  { href: '/kalender', label: 'Agenda', icon: CalendarDays, match: ['/kalender', '/kuliah'] },
  { href: '/saya', label: 'Saya', icon: User, match: ['/saya', '/riset', '/bahasa', '/otomasi', '/pengaturan'] },
];

/** Navigasi HP lima slot, tinggi 76 px, tombol Ra di tengah (DESIGN 5.1). */
export function BottomNav() {
  const path = usePathname();
  const { openRa } = useRa();
  const isOn = (s: Slot) => (s.href === '/' ? path === '/' : s.match.some((m) => path === m || path.startsWith(m + '/')));
  const slot = (s: Slot) => {
    const on = isOn(s);
    return (
      <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined}
        className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] ${on ? 'font-semibold text-accent' : 'text-muted'}`}>
        <s.icon size={22} strokeWidth={1.8} aria-hidden="true" />
        {s.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(76px+env(safe-area-inset-bottom))] grid-cols-5 items-start border-t border-line bg-surface pt-3 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {LEFT.map(slot)}
      <div className="flex justify-center">
        <button type="button" onClick={openRa} aria-label="Buka Ra"
          className="-mt-8 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-fill text-on-accent shadow-ra">
          <RaMark size={26} />
        </button>
      </div>
      {RIGHT.map(slot)}
    </nav>
  );
}
